import fs from "fs";
import path from "path";
import OpenAI from "openai";
import { getStoragePath } from "shared/storageUtils.js";
import {
  loadReferenceImages,
  requestImage,
} from "../../images/openaiImageClient.js";
import { estimateCallCost, type Arm } from "./arms.js";
import {
  beatCaseFrom,
  buildCoverPortraitCases,
  loadBeatCandidates,
  loadStoryStates,
  loadTemplates,
  selectBeatCases,
  type EvalCase,
} from "./cases.js";
import { writeDeliverable } from "./deliverable.js";
import {
  runRatingItems,
  type PhaseRunner,
  type RatingSetPlan,
} from "./itemScheduler.js";
import { storeOutput } from "./outputs.js";
import { estimateProbeCost, runProbe, type ProbeReport } from "./probe.js";
import { planRatingSets } from "./ratingFiles.js";
import { finishedCallKeys, callKey, runCalls, type CallRecord } from "./runner.js";

/*
 * CLI for the image-model eval. Run from server/ (npm run eval:images):
 *   --dry-run (default)          case list, call plan and cost estimate; no API calls
 *   --probe [--max-spend 0.5]    which request parameters GPT Image 2.5 accepts
 *   --run --max-spend <usd>      the paced replay; re-run to resume
 *   --out <dir>                  output folder (default ../DOCS/2026-09-24_gpt6-eval)
 * Reads only local JSON and image files under data/; never touches a database.
 */

type Mode = "dry-run" | "probe" | "run";
type Args = { mode: Mode; maxSpendUsd?: number; outDir: string };

const IMAGES_PER_MINUTE = 5;
const DEFAULT_PROBE_MAX_SPEND = 0.5;

class UsageError extends Error {}

function parseArgs(argv: string[]): Args {
  let mode: Mode = "dry-run";
  let maxSpendUsd: number | undefined;
  let outDir = path.resolve(process.cwd(), "..", "DOCS", "2026-09-24_gpt6-eval");
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run" || arg === "--probe" || arg === "--run") {
      mode = arg.slice(2) as Mode;
    } else if (arg === "--max-spend") {
      maxSpendUsd = Number(argv[++i]);
      if (!Number.isFinite(maxSpendUsd) || maxSpendUsd < 0) {
        throw new UsageError("--max-spend needs a dollar amount, e.g. --max-spend 8");
      }
    } else if (arg === "--out") {
      outDir = path.resolve(argv[++i] ?? "");
    } else {
      throw new UsageError(`Unknown argument: ${arg}`);
    }
  }
  return { mode, maxSpendUsd, outDir };
}

function guardEnvironment(): { storiesDir: string; templatesDir: string } {
  if (process.env.NODE_ENV === "production") {
    throw new UsageError("Refusing to run with NODE_ENV=production.");
  }
  const repoRoot = path.resolve(process.cwd(), "..");
  const storiesDir = path.resolve(getStoragePath("stories"));
  const templatesDir = path.resolve(getStoragePath("templates"));
  const insideRepo = (dir: string) => dir.startsWith(repoRoot + path.sep);
  const ok =
    fs.existsSync(path.join(repoRoot, ".git")) &&
    insideRepo(storiesDir) &&
    insideRepo(templatesDir) &&
    fs.existsSync(storiesDir) &&
    fs.existsSync(templatesDir);
  if (!ok) {
    throw new UsageError(
      "Local data/stories and data/templates were not found inside the repo. Run this from server/: npm run eval:images"
    );
  }
  return { storiesDir, templatesDir };
}

function requireApiKey() {
  if (!process.env.OPENAI_API_KEY) {
    throw new UsageError("OPENAI_API_KEY is not set (expected in server/.env).");
  }
}

function estimate(evalCase: EvalCase, arm: Arm): number {
  return estimateCallCost(arm, evalCase.prompt.length, evalCase.references.length);
}

function buildPlan(storiesDir: string, templatesDir: string) {
  const candidates = loadBeatCandidates(storiesDir);
  const { selected, reserves } = selectBeatCases(candidates, {
    fileExists: (p) => fs.existsSync(p),
  });
  const coverPortraitCases = buildCoverPortraitCases(
    loadStoryStates(storiesDir),
    loadTemplates(templatesDir)
  );
  const plans = planRatingSets(
    selected.map(beatCaseFrom),
    reserves.map(beatCaseFrom),
    coverPortraitCases
  );
  return { plans, candidateCount: candidates.length };
}

/** Estimated spend for calls not finished yet, plus the worst case for reserves. */
function estimateRemaining(
  plans: RatingSetPlan[],
  finished: Set<string>
): { primaryUsd: number; reserveUsd: number; calls: number } {
  let primaryUsd = 0;
  let reserveUsd = 0;
  let calls = 0;
  for (const plan of plans) {
    for (const item of plan.items) {
      for (const arm of item.arms) {
        if (!finished.has(callKey(item.evalCase.id, arm.key))) {
          primaryUsd += estimate(item.evalCase, arm);
          calls++;
        }
      }
    }
    for (const reserve of plan.reserves) {
      const worst = Math.max(
        0,
        ...plan.items.map((item) =>
          item.arms.reduce((sum, arm) => sum + estimate(reserve, arm), 0)
        )
      );
      reserveUsd += worst;
    }
  }
  return { primaryUsd, reserveUsd, calls };
}

function printPlan(plans: RatingSetPlan[], candidateCount: number, outDir: string) {
  console.log(`Output folder: ${outDir}`);
  console.log(`Stored beat image requests found: ${candidateCount}`);
  for (const plan of plans) {
    console.log(`\n${plan.setId}: ${plan.items.length} items, ${plan.reserves.length} reserves`);
    for (const item of plan.items) {
      const cost = item.arms.reduce((sum, arm) => sum + estimate(item.evalCase, arm), 0);
      console.log(
        `  ${item.itemId}  ${item.evalCase.id}  refs ${item.evalCase.references.length}  est $${cost.toFixed(3)}`
      );
      console.log(`      arms: ${item.arms.map((a) => a.key).join(", ")}`);
    }
    for (const reserve of plan.reserves) {
      console.log(`  reserve  ${reserve.id}  refs ${reserve.references.length}`);
    }
  }
}

function readRecords(callsFile: string): CallRecord[] {
  if (!fs.existsSync(callsFile)) {
    return [];
  }
  return fs
    .readFileSync(callsFile, "utf-8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));
}

function readProbe(outDir: string): ProbeReport | undefined {
  const file = path.join(outDir, "probe.json");
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf-8")) : undefined;
}

function createClient(): OpenAI {
  // SDK retries off so the runner counts every attempt; 3-minute timeout
  // matches the template editor's LONG_OPERATION_TIMEOUT
  return new OpenAI({ maxRetries: 0, timeout: 180_000 });
}

function dryRun(args: Args, storiesDir: string, templatesDir: string) {
  const { plans, candidateCount } = buildPlan(storiesDir, templatesDir);
  const outputExists = (file: string) => fs.existsSync(path.join(args.outDir, file));
  const finished = finishedCallKeys(
    readRecords(path.join(args.outDir, "calls.jsonl")),
    outputExists
  );
  printPlan(plans, candidateCount, args.outDir);
  const { primaryUsd, reserveUsd, calls } = estimateRemaining(plans, finished);
  const worst = primaryUsd + reserveUsd;
  console.log(`\nCalls still to make: ${calls}`);
  console.log(
    `Estimated spend: $${primaryUsd.toFixed(2)}, up to $${reserveUsd.toFixed(2)} more if reserves are needed (worst case $${worst.toFixed(2)})`
  );
  console.log(
    `Estimated duration: at least ${Math.ceil(calls / IMAGES_PER_MINUTE)} minutes at ${IMAGES_PER_MINUTE} images/minute`
  );
  if (args.maxSpendUsd !== undefined) {
    console.log(
      worst <= args.maxSpendUsd
        ? `Within --max-spend $${args.maxSpendUsd}.`
        : `Above --max-spend $${args.maxSpendUsd}: --run would refuse to start.`
    );
  }
}

async function probe(args: Args, storiesDir: string, templatesDir: string) {
  requireApiKey();
  const maxSpendUsd = args.maxSpendUsd ?? DEFAULT_PROBE_MAX_SPEND;
  const { plans } = buildPlan(storiesDir, templatesDir);
  const withTwoRefs = plans
    .flatMap((p) => p.items)
    .find((item) => item.evalCase.references.length >= 2);
  if (!withTwoRefs) {
    throw new UsageError("No beat case with two reference images for the edit checks.");
  }
  const referencePaths = withTwoRefs.evalCase.references.slice(0, 2).map((r) => r.path);
  console.log(
    `Probe: estimated $${estimateProbeCost(referencePaths.length).toFixed(3)} before follow-ups, cap $${maxSpendUsd} (checks that would exceed it are skipped)`
  );

  const report = await runProbe(createClient(), referencePaths, {
    maxSpendUsd,
    now: Date.now,
    log: (line) => console.log(`  ${line}`),
  });
  fs.mkdirSync(args.outDir, { recursive: true });
  fs.writeFileSync(path.join(args.outDir, "probe.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Probe spend: $${report.totalCostUsd.toFixed(4)}. Wrote probe.json.`);
}

async function run(args: Args, storiesDir: string, templatesDir: string) {
  requireApiKey();
  if (args.maxSpendUsd === undefined) {
    throw new UsageError("--run needs --max-spend <usd>.");
  }
  const maxSpendUsd = args.maxSpendUsd;
  const { plans } = buildPlan(storiesDir, templatesDir);
  fs.mkdirSync(args.outDir, { recursive: true });
  const callsFile = path.join(args.outDir, "calls.jsonl");
  const outputExists = (file: string) => fs.existsSync(path.join(args.outDir, file));

  const records = readRecords(callsFile);
  let spent = records.reduce((sum, r) => sum + r.costUsd, 0);
  const { primaryUsd, reserveUsd } = estimateRemaining(
    plans,
    finishedCallKeys(records, outputExists)
  );
  if (spent + primaryUsd + reserveUsd > maxSpendUsd) {
    throw new UsageError(
      `Estimated total $${(spent + primaryUsd + reserveUsd).toFixed(2)} (already spent $${spent.toFixed(2)}) exceeds --max-spend $${maxSpendUsd}.`
    );
  }

  const client = createClient();
  // One start log for every phase, so the baseline and candidate phases
  // together stay within the per-minute image limit
  const startLog: number[] = [];
  const runPhase: PhaseRunner = async (calls) => {
    const result = await runCalls(
      calls,
      {
        execute: async (call) => {
          const images = await loadReferenceImages(
            call.evalCase.references.map((r) => r.reference)
          );
          const response = await requestImage(client, {
            prompt: call.evalCase.prompt,
            model: call.arm.model,
            quality: call.arm.quality,
            size: call.arm.size,
            images,
          });
          return { buffer: response.buffer, usage: response.usage };
        },
        store: (call, buffer) => storeOutput(args.outDir, call, buffer),
        record: (record) => {
          fs.appendFileSync(callsFile, `${JSON.stringify(record)}\n`);
          console.log(
            `${record.itemId} ${record.armKey} attempt ${record.attempt}: ${record.status}${record.errorCode ? ` ${record.errorCode}` : ""} (${(record.latencyMs / 1000).toFixed(1)} s, $${record.costUsd.toFixed(4)})`
          );
        },
        now: Date.now,
        sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      },
      { maxSpendUsd, spentUsd: spent, previous: records, outputExists, startLog }
    );
    spent = result.spentUsd;
    records.push(...result.records);
    return { records, stoppedBySpendGuard: result.stoppedBySpendGuard };
  };

  const result = await runRatingItems(plans, records, {
    runPhase,
    estimate,
    outputExists,
  });
  const ratingSets = writeDeliverable({
    outDir: args.outDir,
    plans: result.sets,
    records: result.records,
    partial: result.partial,
    runSpendUsd: spent,
    probe: readProbe(args.outDir),
    now: new Date(),
  });
  const counts = ratingSets.sets.map((s) => `${s.id}: ${s.items.length} items`).join(", ");
  console.log(
    `\n${result.partial ? "Partial run (spend cap reached)" : "Run complete"}. Spend $${spent.toFixed(2)}. ${counts}. Wrote rating-sets.json, rating-key.json, results.md.`
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { storiesDir, templatesDir } = guardEnvironment();
  if (args.mode === "probe") {
    await probe(args, storiesDir, templatesDir);
  } else if (args.mode === "run") {
    await run(args, storiesDir, templatesDir);
  } else {
    dryRun(args, storiesDir, templatesDir);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
