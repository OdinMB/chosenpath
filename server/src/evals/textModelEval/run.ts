import crypto from "crypto";
import fs from "fs";
import path from "path";
import OpenAI from "openai";
import { DEFAULT_TURNS } from "core/config.js";
import type { PlayerCount, StoryTemplate } from "core/types/index.js";
import { getStoragePath } from "shared/storageUtils.js";
import { createStoryStateFromTemplate } from "../../game/services/StoryStateFactory.js";
import { beatStep, type TextRequest } from "../../game/services/storyTextSteps.js";
import { loadStoryStates, loadTemplates } from "../imageModelEval/cases.js";
import {
  baselineArm,
  estimateCall,
  EVAL_ROLES,
  outputTokensPerSecond,
  STAGES,
  type EvalRole,
  type Stage,
} from "./arms.js";
import { htmlLeaks, metadataLeaks } from "./blinding.js";
import { resolveCaps, spentByStage, type Caps, type SpendRecord } from "./budget.js";
import { buildCases } from "./caseBuilder.js";
import { caseStory, loadStoredSnapshots, type EvalCase } from "./cases.js";
import { evalFiles, type EvalFiles } from "./evalFiles.js";
import { executeCall } from "./executor.js";
import { planJobs, requestJob, type PlanOptions } from "./jobPlan.js";
import { checksForRecords } from "./outputChecks.js";
import { previewSource, STORED_ARM } from "./previewSource.js";
import { estimateCheckCost, probeChecks, runProbe } from "./probe.js";
import { renderRatingPage } from "./ratingPage.js";
import { planRatingSet, type ArmRef, type RatingKind } from "./ratingSets.js";
import { renderScores, scoreRatings, type ExportedRatings } from "./ratingScore.js";
import { renderResults } from "./resultsReport.js";
import { DEFAULT_TOKENS_PER_MINUTE, keyOf, runJobs, usable, finishedJobKeys, type Job } from "./runner.js";

/*
 * CLI for the text-model eval. Run from server/ (npm run eval:text -- …):
 *   --dry-run (default)           cases, calls, estimated $ and duration per stage; no API calls
 *   --probe [--max-spend 1]       which parameters and schemas Sol and Luna accept
 *   --build-cases [--rebuild-cases] [--max-spend 0.75]
 *   --run --stage 0|1-2|3|4 --prompt-state <tag> [filters]
 *   --rating-page setup|turn --arms <k1,k2,…> [--items N] [--preview [--stored]]
 *   --score <export.json>
 * Filters: --role setup,beat,switch,thread,iteration (analysis = switch+thread),
 *   --mode isolated|pipeline, --arms, --cases, --samples N, --subset15
 * Budget: --max-spend <usd> (this invocation), --global-cap, --stage-cap,
 *   --over-target-reason "<text>"; --tpm <tokens/min per model>; --out <dir>
 * Reads only local files under data/ and the frozen cases; never touches a database.
 */

type Mode = "dry-run" | "probe" | "build-cases" | "run" | "rating-page" | "score";

type Args = {
  mode: Mode;
  stage?: Stage;
  promptState?: string;
  roles: EvalRole[];
  mode2: "isolated" | "pipeline";
  armKeys?: string[];
  caseIds?: string[];
  samples?: number;
  subset15: boolean;
  maxSpend?: number;
  globalCap?: number;
  stageCap?: number;
  overTargetReason?: string;
  tpm: number;
  outDir: string;
  rebuildCases: boolean;
  ratingKind?: RatingKind;
  items?: number;
  preview: boolean;
  /** Preview pages from stored beats and setups (no eval output needed) */
  stored: boolean;
  scoreFile?: string;
};

class UsageError extends Error {}

const DEFAULT_PROBE_MAX_SPEND = 1;
const DEFAULT_BUILD_MAX_SPEND = 0.75;
const DEFAULT_ITEMS: Record<RatingKind, number> = { setup: 6, turn: 15 };
const MAX_IN_FLIGHT = 6;

function numberArg(name: string, value: string | undefined): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new UsageError(`${name} needs a number`);
  return n;
}

function rolesArg(value: string | undefined): EvalRole[] {
  const roles = (value ?? "").split(",").flatMap((r) => (r === "analysis" ? ["switch", "thread"] : [r]));
  for (const role of roles) {
    if (!EVAL_ROLES.includes(role as EvalRole)) throw new UsageError(`Unknown role ${role}`);
  }
  return roles as EvalRole[];
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    mode: "dry-run",
    roles: ["setup", "beat", "switch", "thread"],
    mode2: "isolated",
    subset15: false,
    tpm: DEFAULT_TOKENS_PER_MINUTE,
    outDir: path.resolve(process.cwd(), "..", "DOCS", "2026-09-26_gpt6-text-eval"),
    rebuildCases: false,
    preview: false,
    stored: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[++i];
    switch (arg) {
      case "--dry-run":
      case "--probe":
      case "--build-cases":
      case "--run":
        args.mode = arg.slice(2) as Mode;
        break;
      case "--rating-page": {
        args.mode = "rating-page";
        const kind = next();
        if (kind !== "setup" && kind !== "turn") throw new UsageError("--rating-page needs setup or turn");
        args.ratingKind = kind;
        break;
      }
      case "--score":
        args.mode = "score";
        args.scoreFile = path.resolve(next() ?? "");
        break;
      case "--stage": {
        const stage = next();
        if (!STAGES.includes(stage as Stage)) throw new UsageError(`--stage is one of ${STAGES.join(", ")}`);
        args.stage = stage as Stage;
        break;
      }
      case "--prompt-state":
        args.promptState = next();
        break;
      case "--role":
        args.roles = rolesArg(next());
        break;
      case "--mode": {
        const mode = next();
        if (mode !== "isolated" && mode !== "pipeline") throw new UsageError("--mode is isolated or pipeline");
        args.mode2 = mode;
        break;
      }
      case "--arms":
        args.armKeys = (next() ?? "").split(",").filter(Boolean);
        break;
      case "--cases":
        args.caseIds = (next() ?? "").split(",").filter(Boolean);
        break;
      case "--samples":
        args.samples = numberArg(arg, next());
        break;
      case "--subset15":
        args.subset15 = true;
        break;
      case "--max-spend":
        args.maxSpend = numberArg(arg, next());
        break;
      case "--global-cap":
        args.globalCap = numberArg(arg, next());
        break;
      case "--stage-cap":
        args.stageCap = numberArg(arg, next());
        break;
      case "--over-target-reason":
        args.overTargetReason = next();
        break;
      case "--tpm":
        args.tpm = numberArg(arg, next());
        break;
      case "--out":
        args.outDir = path.resolve(next() ?? "");
        break;
      case "--rebuild-cases":
        args.rebuildCases = true;
        break;
      case "--items":
        args.items = numberArg(arg, next());
        break;
      case "--preview":
        args.preview = true;
        break;
      case "--stored":
        args.stored = true;
        break;
      default:
        throw new UsageError(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function guardEnvironment(): { storiesDir: string; templatesDir: string; checkpointsDir: string } {
  if (process.env.NODE_ENV === "production") {
    throw new UsageError("Refusing to run with NODE_ENV=production.");
  }
  const repoRoot = path.resolve(process.cwd(), "..");
  const storiesDir = path.resolve(getStoragePath("stories"));
  const templatesDir = path.resolve(getStoragePath("templates"));
  const checkpointsDir = path.resolve(repoRoot, "data", "story_checkpoints");
  const insideRepo = (dir: string) => dir.startsWith(repoRoot + path.sep);
  const ok =
    fs.existsSync(path.join(repoRoot, ".git")) &&
    insideRepo(storiesDir) &&
    insideRepo(templatesDir) &&
    fs.existsSync(storiesDir) &&
    fs.existsSync(templatesDir);
  if (!ok) {
    throw new UsageError(
      "Local data/stories and data/templates were not found inside the repo. Run this from server/: npm run eval:text"
    );
  }
  return { storiesDir, templatesDir, checkpointsDir };
}

function requireApiKey() {
  if (!process.env.OPENAI_API_KEY) {
    throw new UsageError("OPENAI_API_KEY is not set (expected in server/.env).");
  }
}

function newStory(template: StoryTemplate, playerCount: PlayerCount, caseId: string) {
  const maxTurns = Math.min(Math.max(DEFAULT_TURNS, template.maxTurnsMin || DEFAULT_TURNS), template.maxTurnsMax || DEFAULT_TURNS);
  const difficulty =
    template.difficultyLevels.find((d) => d.modifier === 0) ?? template.difficultyLevels[0] ?? { title: "Balanced", modifier: 0 };
  const codes = Object.fromEntries(Array.from({ length: playerCount }, (_, i) => [`player${i + 1}`, `EVAL${i + 1}`]));
  return createStoryStateFromTemplate(caseId, template, playerCount, maxTurns, template.containsImages, true, difficulty, codes);
}

/** Probe spend lives in probe.json; it counts against Stage 0. */
function extraSpend(files: EvalFiles): SpendRecord[] {
  const probe = files.readProbe();
  return probe ? [{ stage: "0", costUsd: probe.totalCostUsd + (probe.priorSpendUsd ?? 0) }] : [];
}

function capsFor(args: Args, files: EvalFiles, stage: Stage, defaultMaxSpend?: number): Caps {
  const { caps, override } = resolveCaps({
    stage,
    stageCap: args.stageCap,
    globalCap: args.globalCap,
    maxSpend: args.maxSpend ?? defaultMaxSpend,
    overTargetReason: args.overTargetReason,
  });
  if (override) {
    files.appendOverride(override);
    console.log(`Cap raised above the owner's target (${override.reason}); recorded in budget-overrides.jsonl.`);
  }
  return caps;
}

const jobCost = (job: Job) => job.first.estimate.costUsd + (job.then?.estimate.costUsd ?? 0);

/** At least the token-per-minute limit, and at least the calls' writing time over the in-flight slots. */
function estimateMinutes(jobs: Job[], tpm: number): number {
  const tokens = new Map<string, number>();
  let seconds = 0;
  for (const job of jobs) {
    for (const call of [job.first, ...(job.then ? [{ arm: job.then.arm, estimate: job.then.estimate }] : [])]) {
      const t = call.estimate.inputTokens + call.estimate.outputTokens;
      tokens.set(call.arm.model, (tokens.get(call.arm.model) ?? 0) + t);
      seconds += 2 + call.estimate.outputTokens / outputTokensPerSecond(call.arm.model);
    }
  }
  const tokenMinutes = Math.max(0, ...[...tokens.values()].map((t) => t / tpm));
  return Math.max(tokenMinutes, seconds / MAX_IN_FLIGHT / 60);
}

function planOptions(args: Args, stage: Stage, promptState: string, records: PlanOptions["records"], extra: Partial<PlanOptions> = {}): PlanOptions {
  return {
    stage,
    promptState,
    roles: args.roles,
    mode: args.mode2,
    armKeys: args.armKeys,
    caseIds: args.caseIds,
    samples: args.samples,
    subset15: args.subset15,
    records,
    ...extra,
  };
}

/** Cases without API calls: stored, endings, premises, iteration; synthetic analysis turns and template builds wait. */
async function localCases(dirs: ReturnType<typeof guardEnvironment>) {
  const requests: { role: EvalRole; caseId: string; request: TextRequest; players: number }[] = [];
  const { cases, report } = await buildCases({
    snapshots: loadStoredSnapshots(dirs.storiesDir, dirs.checkpointsDir),
    templates: loadTemplates(dirs.templatesDir),
    newStory,
    callBaseline: async (role, caseId, request, players) => {
      requests.push({ role, caseId, request, players });
      return undefined;
    },
    log: () => undefined,
  });
  return { cases, report, requests };
}

/**
 * What --build-cases would spend: the first call of every build is known
 * (a switch analysis); each template build then needs a first beat (median
 * stored beat prompt) and, for multiplayer continuations, a thread analysis.
 */
function buildEstimate(local: Awaited<ReturnType<typeof localCases>>): number {
  const beatChars = local.cases
    .filter((c) => c.role === "beat")
    .map((c) => beatStep.request(caseStory(c)).prompt.length)
    .sort((a, b) => a - b);
  const medianBeatChars = beatChars[Math.floor(beatChars.length / 2)] ?? 60_000;
  return local.requests.reduce((sum, r) => {
    const est = (role: EvalRole, promptChars: number) =>
      estimateCall({ role, arm: baselineArm(role, r.players > 1), players: r.players, promptChars }).costUsd;
    const known = est(r.role, r.request.prompt.length);
    if (!r.caseId.startsWith("switch-tpl-")) return sum + known;
    const beat = est("beat", medianBeatChars + 4_000 * (r.players - 1));
    const thread = r.players > 1 ? est("thread", r.request.prompt.length) : 0;
    return sum + known + beat + thread;
  }, 0);
}

async function dryRun(args: Args, files: EvalFiles, dirs: ReturnType<typeof guardEnvironment>) {
  const records = files.readRecords();
  const finished = finishedJobKeys(records);
  const frozen = files.casesExist();
  let cases: EvalCase[];
  console.log(`Output folder: ${files.outDir}`);
  if (frozen) {
    cases = files.readCases();
    console.log(`Frozen cases: ${cases.length}`);
  } else {
    const local = await localCases(dirs);
    cases = local.cases;
    console.log(`No frozen cases yet. Local cases (no API calls): ${JSON.stringify(local.report.counts)}`);
    console.log(`Stored units per story: ${JSON.stringify(local.report.storedUnitsByStory)}`);
    console.log(`Case building (--build-cases): about $${buildEstimate(local).toFixed(2)}`);
    console.log("The stage estimates below leave out the cases --build-cases adds (first beats, multiplayer, template analysis).");
  }

  const spend = spentByStage([...records, ...extraSpend(files)]);
  const caps = resolveCaps({}).caps;
  const probeEstimate = probeChecks().reduce((sum, check) => sum + estimateCheckCost(check), 0) + 0.06;
  const rows: [string, Stage, Job[]][] = [
    ["Stage 0 pre-fix baseline (1 sample, isolated)", "0", planJobs(cases, planOptions(args, "0", "prefix", records, { samples: args.samples ?? 1, mode: "isolated" }))],
    ["Stage 0 post-fix baseline (2 samples, isolated)", "0", planJobs(cases, planOptions(args, "0", "postfix", records, { samples: args.samples ?? 2, mode: "isolated" }))],
    ["Stage 0 post-fix baseline pipeline chains", "0", planJobs(cases, planOptions(args, "0", "postfix", records, { mode: "pipeline", roles: ["switch", "thread"] })).filter((j) => j.group === "pipeline")],
    ["Stages 1-2 candidates (isolated)", "1-2", planJobs(cases, planOptions(args, "1-2", "postfix", records, { mode: "isolated" })).filter((j) => !j.baseline)],
    ["Stages 1-2 pipeline chains", "1-2", planJobs(cases, planOptions(args, "1-2", "postfix", records, { mode: "pipeline", roles: ["switch", "thread"] })).filter((j) => !j.baseline)],
  ];
  console.log(`\nProbe: about $${probeEstimate.toFixed(2)} (checks over the cap are skipped)`);
  for (const [label, stage, jobs] of rows) {
    const open = jobs.filter((j) => !finished.has(keyOf(j)));
    const cost = open.reduce((sum, j) => sum + jobCost(j), 0);
    const byRole = open.reduce<Record<string, number>>((acc, j) => ((acc[j.group] = (acc[j.group] ?? 0) + 1), acc), {});
    console.log(
      `${label}: ${open.length} jobs ${JSON.stringify(byRole)}, est $${cost.toFixed(2)} (stage cap $${caps.stageCaps[stage]}), at least ${Math.ceil(estimateMinutes(open, args.tpm))} min`
    );
  }
  console.log("Stages 3 and 4: no arms yet (their variants arrive with later milestones).");
  console.log("\nSpend so far vs caps:");
  for (const stage of STAGES) {
    console.log(`  Stage ${stage}: $${spend.byStage[stage].toFixed(2)} of $${caps.stageCaps[stage]}`);
  }
  console.log(`  Total: $${spend.total.toFixed(2)} of $${caps.globalCap} (never above $50)`);
  console.log(`Baseline arms from production config: setup ${baselineArm("setup", false).key}, beat ${baselineArm("beat", false).key}, analysis ${baselineArm("switch", false).key}`);
}

function refuseIfOverCaps(caps: Caps, files: EvalFiles, stage: Stage, estimate: number) {
  const spend = spentByStage([...files.readRecords(), ...extraSpend(files)]);
  const problems = [
    spend.byStage[stage] + estimate > caps.stageCaps[stage] ? `Stage ${stage} cap $${caps.stageCaps[stage]} (spent $${spend.byStage[stage].toFixed(2)})` : "",
    spend.total + estimate > caps.globalCap ? `global cap $${caps.globalCap} (spent $${spend.total.toFixed(2)})` : "",
    caps.maxSpend !== undefined && estimate > caps.maxSpend ? `--max-spend $${caps.maxSpend}` : "",
  ].filter(Boolean);
  if (problems.length) {
    throw new UsageError(`Estimated $${estimate.toFixed(2)} would exceed: ${problems.join("; ")}. Nothing was sent.`);
  }
}

function runnerDeps(files: EvalFiles) {
  return {
    execute: (spec: Parameters<typeof executeCall>[0]) => executeCall(spec, { outDir: files.outDir, now: Date.now }),
    record: (record: Parameters<EvalFiles["appendRecord"]>[0]) => {
      files.appendRecord(record);
      console.log(
        `${record.caseId} ${record.callArmKey} s${record.sample} step ${record.step} attempt ${record.attempt}: ${record.outcome}${record.status && record.status >= 400 ? ` ${record.status}` : ""} (${(record.latencyMs / 1000).toFixed(1)} s, $${record.costUsd.toFixed(4)})`
      );
    },
    now: Date.now,
    sleep: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
    warn: (line: string) => console.warn(`WARNING: ${line}`),
  };
}

async function probe(args: Args, files: EvalFiles) {
  requireApiKey();
  const caps = capsFor(args, files, "0", DEFAULT_PROBE_MAX_SPEND);
  const maxSpendUsd = caps.maxSpend ?? DEFAULT_PROBE_MAX_SPEND;
  refuseIfOverCaps(caps, files, "0", maxSpendUsd);
  const previous = files.readProbe();
  const report = await runProbe(new OpenAI({ maxRetries: 0, timeout: 120_000 }), {
    maxSpendUsd,
    log: (line) => console.log(`  ${line}`),
    executeCall: (spec) => executeCall(spec, { outDir: files.outDir, now: Date.now }),
  });
  report.priorSpendUsd = previous ? previous.totalCostUsd + (previous.priorSpendUsd ?? 0) : undefined;
  files.writeProbe(report);
  console.log(`Probe spend: $${report.totalCostUsd.toFixed(4)}. Wrote probe.json.`);
}

async function buildCasesMode(args: Args, files: EvalFiles, dirs: ReturnType<typeof guardEnvironment>) {
  requireApiKey();
  if (files.casesExist() && !args.rebuildCases) {
    throw new UsageError("Cases are already frozen. --rebuild-cases replaces them (and changes the eval's inputs).");
  }
  const caps = capsFor(args, files, "0", DEFAULT_BUILD_MAX_SPEND);
  refuseIfOverCaps(caps, files, "0", 0);
  const records = files.readRecords();
  const deps = runnerDeps(files);
  const { cases, report } = await buildCases({
    snapshots: loadStoredSnapshots(dirs.storiesDir, dirs.checkpointsDir),
    templates: loadTemplates(dirs.templatesDir),
    newStory,
    callBaseline: async (role, caseId, request, players) => {
      const job = requestJob({ stage: "0", promptState: "prefix", caseId, role, arm: baselineArm(role, players > 1), players, request, records });
      const result = await runJobs([job], deps, { caps, previous: records, extraSpend: extraSpend(files), tokensPerMinute: args.tpm });
      records.push(...result.records);
      if (result.stoppedReason) console.warn(`Stopped: ${result.stoppedReason}`);
      const final = records.find((r) => r.jobKey === keyOf(job) && r.jobFinal);
      return final && usable(final) ? files.loadOutput(final) : undefined;
    },
    log: (line) => console.log(line),
  });
  files.writeCases(cases, report);
  console.log(`Froze ${cases.length} cases. Thread types: ${JSON.stringify(report.threadTypes)}. Skipped: ${report.skipped.length}`);
  for (const line of report.skipped) console.log(`  skipped: ${line}`);
}

async function run(args: Args, files: EvalFiles) {
  requireApiKey();
  if (!args.stage || !args.promptState) throw new UsageError("--run needs --stage and --prompt-state.");
  if (!files.casesExist()) throw new UsageError("No frozen cases. Run --build-cases first.");
  const caps = capsFor(args, files, args.stage);
  const records = files.readRecords();
  const cases = files.readCases();
  const jobs = planJobs(cases, planOptions(args, args.stage, args.promptState, records));
  const finished = finishedJobKeys(records);
  const estimate = jobs.filter((j) => !finished.has(keyOf(j))).reduce((sum, j) => sum + jobCost(j), 0);
  refuseIfOverCaps(caps, files, args.stage, estimate);
  console.log(`${jobs.length} jobs (${jobs.filter((j) => !finished.has(keyOf(j))).length} open), est $${estimate.toFixed(2)}`);
  const result = await runJobs(jobs, runnerDeps(files), {
    caps,
    previous: records,
    extraSpend: extraSpend(files),
    tokensPerMinute: args.tpm,
    maxInFlight: MAX_IN_FLIGHT,
  });
  writeResults(files, caps, cases);
  console.log(`${result.stoppedReason ? `Stopped: ${result.stoppedReason}` : "Run complete"}. Wrote results.md.`);
}

function writeResults(files: EvalFiles, caps: Caps, cases: EvalCase[]) {
  const records = files.readRecords();
  const { checks, prose } = checksForRecords(records, cases, files.loadOutput);
  files.writeResults(
    renderResults({
      records,
      checks,
      tags: new Map(cases.map((c) => [c.id, c.tags])),
      caps,
      probe: files.readProbe(),
      prose,
      generatedAt: new Date(),
    })
  );
}

function armRefs(args: Args): ArmRef[] {
  const promptState = args.promptState ?? "prefix";
  return (args.armKeys ?? []).map((ref) => {
    const colon = ref.indexOf(":");
    return colon > 0 && !ref.slice(0, colon).includes("@")
      ? { promptState: ref.slice(0, colon), armKey: ref.slice(colon + 1) }
      : { promptState, armKey: ref };
  });
}

/** Eval outputs, or (--preview --stored) the stored beats and custom-story setups, for a layout check. */
async function ratingMaterial(args: Args, files: EvalFiles, dirs: ReturnType<typeof guardEnvironment>, kind: RatingKind) {
  if (!args.stored) {
    return { arms: armRefs(args), cases: files.readCases(), records: files.readRecords(), loadOutput: files.loadOutput };
  }
  if (!args.preview) throw new UsageError("--stored is for --preview pages only.");
  const cases = files.casesExist() ? files.readCases() : (await localCases(dirs)).cases;
  const custom = loadStoryStates(dirs.storiesDir).filter((s) => !s.templateId);
  return { arms: [STORED_ARM], ...previewSource(kind, cases, custom) };
}

async function ratingPage(args: Args, files: EvalFiles, dirs: ReturnType<typeof guardEnvironment>) {
  const kind = args.ratingKind as RatingKind;
  const { arms, cases, records, loadOutput } = await ratingMaterial(args, files, dirs, kind);
  if (arms.length === 0) throw new UsageError("--rating-page needs --arms <baseline,candidate,…>.");
  if (arms.length === 1 && !args.preview) throw new UsageError("A real rating page needs at least two arms (or --preview).");
  const { set, key } = planRatingSet(
    { kind, arms, items: args.items ?? DEFAULT_ITEMS[kind], preview: args.preview },
    records,
    cases,
    { loadOutput, salt: crypto.randomBytes(16).toString("hex"), now: new Date() }
  );
  const html = renderRatingPage(set);
  const leaks = [...metadataLeaks(set), ...htmlLeaks(html, key)];
  if (leaks.length > 0) {
    throw new UsageError(`The page would reveal an arm; nothing written:\n  ${leaks.join("\n  ")}`);
  }
  const page = files.writeRatingPage(`${set.setId}-${set.pageId}.html`, html, args.preview);
  files.writeKey(key);
  console.log(`Wrote ${set.items.length} items to ${page}`);
  console.log(`Open: file:///${page.replace(/\\/g, "/")}`);
  for (const note of key.notes) console.log(`  note: ${note}`);
}

function score(args: Args, files: EvalFiles) {
  const exported = JSON.parse(fs.readFileSync(args.scoreFile as string, "utf-8")) as ExportedRatings;
  const key = files.readKey(exported.pageId);
  if (!key) throw new UsageError(`No answer key for page ${exported.pageId} in ${files.at("keys")}.`);
  const scores = scoreRatings(exported, key);
  files.writeScores(`${key.setId}-${key.pageId}`, renderScores(scores), scores);
  console.log(`Wrote scores/${key.setId}-${key.pageId}.md and .json`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dirs = guardEnvironment();
  const files = evalFiles(args.outDir);
  switch (args.mode) {
    case "probe":
      return probe(args, files);
    case "build-cases":
      return buildCasesMode(args, files, dirs);
    case "run":
      return run(args, files);
    case "rating-page":
      return ratingPage(args, files, dirs);
    case "score":
      return score(args, files);
    default:
      return dryRun(args, files, dirs);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
