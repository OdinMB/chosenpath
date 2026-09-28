import crypto from "crypto";
import fs from "fs";
import path from "path";
import OpenAI from "openai";
import { DEFAULT_TURNS } from "core/config.js";
import type { PlayerCount, SetOfBeatGenerationSchema, StoryTemplate } from "core/types/index.js";
import { getStoragePath } from "shared/storageUtils.js";
import { repairBeatReply } from "../../game/services/beatRepairs.js";
import { createStoryStateFromTemplate } from "../../game/services/StoryStateFactory.js";
import { contentFilterClassifier } from "../../game/services/ContentFilterService.js";
import { loadStoryStates, loadTemplates } from "../imageModelEval/cases.js";
import { armSettings, baselineArm, EVAL_ROLES, STAGES, type EvalRole, type Stage } from "./arms.js";
import { htmlLeaks, metadataLeaks } from "./blinding.js";
import { budgetCheck, resolveCaps, spentByStage, type Caps, type LedgerStage, type SpendRecord } from "./budget.js";
import { buildCases } from "./caseBuilder.js";
import { caseStory, loadStoredSnapshots, type EvalCase } from "./cases.js";
import { checkBaselines, renderCheckBaselines, type BaselineReport } from "./checkBaselines.js";
import { localCases, printDryRun, type LocalCaseSources } from "./dryRun.js";
import { evalFiles, type EvalFiles } from "./evalFiles.js";
import { executeCall, sha256 } from "./executor.js";
import { FILTER_CASES } from "./filterCases.js";
import {
  DEFAULT_FILTER_ARMS,
  FILTER_ARMS,
  filterCheckEstimateUsd,
  filterSpendUsd,
  openFilterCases,
  renderFilterReport,
  runFilterCheck,
  scoreFilterCheck,
} from "./filterCheck.js";
import { jobEstimateUsd, planJobs, rebuiltToday, requestJob, todaysRequestHash, type PlanOptions } from "./jobPlan.js";
import { checksForRecords } from "./outputChecks.js";
import { prepSpend } from "./prepCalls.js";
import { previewSource, STORED_ARM } from "./previewSource.js";
import { runProbe } from "./probe.js";
import { renderRatingPage } from "./ratingPage.js";
import { planRatingSet, ratingSetFromKey, type ArmRef, type RatingKind } from "./ratingSets.js";
import { renderPairwiseScores, renderScores, scorePairwise, scoreRatings, type ExportedRatings } from "./ratingScore.js";
import { renderResults } from "./resultsReport.js";
import { DEFAULT_TOKENS_PER_MINUTE, finishedJobKeys, finishingRecord, keyOf, runJobs, usable, type CallRecord } from "./runner.js";
import { statReadouts } from "./turnDesignChecks.js";
import { turnKindOf } from "./turnWaits.js";
import {
  DEFAULT_JUDGE_SAMPLES,
  DEFAULT_RECORD_JUDGE_SAMPLES,
  backfillChaptersMode,
  buildRoundCasesMode,
  judgeCalibrationMode,
  judgeRecordsMode,
  printPrepPlan,
  spendBeside,
  type PrepContext,
} from "./turnPrep.js";
import { CURRENT_PROMPT_STATE, PRE_FIX_PROMPT_STATE, retiredPromptStateProblem } from "./variants.js";

/*
 * CLI for the text-model eval. Run from server/ (npm run eval:text -- …):
 *   --dry-run (default) [--prompt-state <tag>, default round0]  cases, open jobs, estimated $ and duration per stage; no API calls
 *   --probe [--max-spend 1]       which parameters and schemas Sol and Luna accept
 *   --build-cases [--rebuild-cases] [--max-spend 0.75]
 *   --run --stage 0|1-2|3|4|setup-rounds|turn-rounds|migration --prompt-state <tag> [filters]
 *     (refuses the retired "prefix" and "postfix"; the rounds and the migration check run no baseline)
 *   --rating-page setup|turn --arms <k1,k2,…> [--items N] [--per-item K] [--pairwise] [--no-repeat] [--preview [--stored]]
 *     (--per-item K: the baseline plus K rotating candidates per item; --cases limits the regular items;
 *     --pairwise: exactly two arms, the reference then the candidate, Which is better? per item;
 *     --chain-arms <ref chain>,<candidate chain> [--chain-items 4]: on a pairwise turn page, chapter openings
 *     too, each option the chain's first turn with its own plan;
 *     --no-repeat: leaves the repeated item out)
 *   --rerender-page <pageId>      renders an existing key's page afresh (same items, labels, page id)
 *   --score <export.json>
 *   --results                     rewrites results.md from the stored records (after a reading changed); no API calls
 *   --check-baselines [--ratings <export.json>,…]  the improvement documents' new checks over every stored
 *     output, per arm with the two-sample noise, what separates the rated pages' rank-1 picks, waits per
 *     turn kind and the stored references' currency; writes check-baselines.md and .json. No API calls.
 *   --filter-check [--arms k1,k2] [--fresh] [--max-spend 0.30]  the content filter's fixed test set through
 *     the production filter path (default arms: gpt-4.1-mini and Luna low); its own ledger stage, capped at
 *     $0.30. Answered pairs are skipped unless --fresh.
 *   The turn rounds' preparation (turnPrep.ts), in the turn-rounds stage:
 *   --build-round-cases [--rebuild-cases] [--max-spend 0.10]  the cases play never produced (roundCases.ts),
 *     frozen beside the others; the few missing turns and plans come from production's GPT-6 defaults
 *   --backfill-chapters [--max-spend 0.10]  a chapter question and plan per stored chapter (chapterFrames.ts)
 *   --judge-calibration [--arms gpt-6-luna@low] [--samples 2] [--max-spend 0.10]  the judged checks on the
 *     hand-read turns (judgedChecks.ts)
 *   --judge-records --arms <beat or chain keys> --prompt-state <tag> [--samples 1] [--max-spend 0.10]  the judged
 *     checks on a round's chapter steps (the reference and the candidates), then judged-turns.md and .json
 * Filters: --role setup,beat,switch,thread,iteration (analysis = switch+thread),
 *   --mode isolated|pipeline, --arms, --cases, --samples N, --subset15,
 *   --no-mp-continuations (drops multiplayer beats other than first beats and endings),
 *   --rare-failure skip|only (leaves out, or plans only, the rare-failure batch)
 * Budget: --max-spend <usd> (this invocation), --global-cap, --stage-cap,
 *   --over-target-reason "<text>" (a --run that raises --stage-cap also needs --arms);
 *   --tpm <tokens/min per model>; --out <dir>
 * Reads only local files under data/ and the frozen cases; never touches a database.
 */

type Mode =
  | "dry-run"
  | "probe"
  | "build-cases"
  | "run"
  | "rating-page"
  | "rerender-page"
  | "score"
  | "filter-check"
  | "check-baselines"
  | "results"
  | "build-round-cases"
  | "backfill-chapters"
  | "judge-calibration"
  | "judge-records";

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
  skipMultiplayerContinuations: boolean;
  rareFailure?: "skip" | "only";
  maxSpend?: number;
  globalCap?: number;
  stageCap?: number;
  overTargetReason?: string;
  tpm: number;
  outDir: string;
  rebuildCases: boolean;
  ratingKind?: RatingKind;
  items?: number;
  /** Rating pages: candidates shown beside the baseline per item, rotated */
  perItem?: number;
  /** Rating pages: the reference against one candidate, Which is better? per item */
  pairwise: boolean;
  /** Rating pages: the repeated item (--no-repeat turns it off) */
  repeat: boolean;
  /** Pairwise turn pages: the chapter-opening items' two chains (reference, candidate), and how many */
  chainArmKeys?: string[];
  chainItems?: number;
  preview: boolean;
  /** Preview pages from stored beats and setups (no eval output needed) */
  stored: boolean;
  scoreFile?: string;
  /** --rerender-page: the page whose key to render afresh */
  pageId?: string;
  /** --filter-check --fresh: ask every case again; earlier records stay in the ledger */
  fresh: boolean;
  /** --check-baselines --ratings: rating exports whose rank-1 picks to read the checks against */
  ratingsFiles: string[];
};

class UsageError extends Error {}

const DEFAULT_PROBE_MAX_SPEND = 1;
const DEFAULT_BUILD_MAX_SPEND = 0.75;
const DEFAULT_ITEMS: Record<RatingKind, number> = { setup: 6, turn: 15 };
/** The round pages: nine setup premises (setup doc section 4), about 14 turns (turn doc round 1) */
const DEFAULT_PAIRWISE_ITEMS: Record<RatingKind, number> = { setup: 9, turn: 14 };
/** Turn round 1's page: 3-4 chapter-opening items beside about 10 chapter steps (turn doc section 4) */
const DEFAULT_CHAIN_ITEMS = 4;
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
    skipMultiplayerContinuations: false,
    tpm: DEFAULT_TOKENS_PER_MINUTE,
    outDir: path.resolve(process.cwd(), "..", "DOCS", "2026-09-26_gpt6-text-eval"),
    rebuildCases: false,
    pairwise: false,
    repeat: true,
    preview: false,
    stored: false,
    fresh: false,
    ratingsFiles: [],
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[++i];
    switch (arg) {
      case "--dry-run":
      case "--probe":
      case "--build-cases":
      case "--run":
      case "--filter-check":
      case "--check-baselines":
      case "--results":
      case "--build-round-cases":
      case "--backfill-chapters":
      case "--judge-calibration":
      case "--judge-records":
        args.mode = arg.slice(2) as Mode;
        break;
      case "--ratings":
        args.ratingsFiles = (next() ?? "").split(",").filter(Boolean).map((file) => path.resolve(file));
        break;
      case "--rating-page": {
        args.mode = "rating-page";
        const kind = next();
        if (kind !== "setup" && kind !== "turn") throw new UsageError("--rating-page needs setup or turn");
        args.ratingKind = kind;
        break;
      }
      case "--rerender-page":
        args.mode = "rerender-page";
        args.pageId = next();
        if (!args.pageId) throw new UsageError("--rerender-page needs a page id (the key's -<pageId>.json suffix)");
        break;
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
      case "--no-mp-continuations":
        args.skipMultiplayerContinuations = true;
        break;
      case "--rare-failure": {
        const value = next();
        if (value !== "skip" && value !== "only") throw new UsageError("--rare-failure is skip or only");
        args.rareFailure = value;
        break;
      }
      case "--per-item":
        args.perItem = numberArg(arg, next());
        break;
      case "--pairwise":
        args.pairwise = true;
        break;
      case "--chain-arms":
        args.chainArmKeys = (next() ?? "").split(",").filter(Boolean);
        break;
      case "--chain-items":
        args.chainItems = numberArg(arg, next());
        break;
      case "--no-repeat":
        args.repeat = false;
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
      case "--fresh":
        args.fresh = true;
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

/**
 * Spend outside calls.jsonl: the probe's (probe.json, Stage 0), the filter
 * check's (filter-check.jsonl) and the turn rounds' preparation calls
 * (prep-calls.jsonl, their own stage).
 */
function extraSpend(files: EvalFiles): SpendRecord[] {
  return spendBeside(files, "calls");
}

function capsFor(args: Args, files: EvalFiles, stage: LedgerStage, defaultMaxSpend?: number): Caps {
  const { caps, override } = resolveCaps({
    stage,
    stageCap: args.stageCap,
    globalCap: args.globalCap,
    maxSpend: args.maxSpend ?? defaultMaxSpend,
    overTargetReason: args.overTargetReason,
    forRun: args.mode === "run",
    armKeys: args.armKeys,
  });
  if (override) {
    files.appendOverride(override);
    console.log(`Cap raised above the owner's target (${override.reason}); recorded in budget-overrides.jsonl.`);
  }
  return caps;
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
    skipMultiplayerContinuations: args.skipMultiplayerContinuations,
    rareFailure: args.rareFailure,
    records,
    ...extra,
  };
}

function localSources(dirs: ReturnType<typeof guardEnvironment>): LocalCaseSources {
  return {
    snapshots: loadStoredSnapshots(dirs.storiesDir, dirs.checkpointsDir),
    templates: loadTemplates(dirs.templatesDir),
    newStory,
  };
}

async function dryRun(args: Args, files: EvalFiles, dirs: ReturnType<typeof guardEnvironment>) {
  const records = files.readRecords();
  await printDryRun({
    outDir: files.outDir,
    records,
    extraSpend: extraSpend(files),
    frozenCases: files.casesExist() ? files.readCases() : undefined,
    sources: localSources(dirs),
    options: (stage, promptState, extra) => planOptions(args, stage, promptState, records, extra),
    promptState: args.promptState,
    samples: args.samples,
    tpm: args.tpm,
    maxInFlight: MAX_IN_FLIGHT,
    log: (line) => console.log(line),
  });
  printPrepPlan(files, (line) => console.log(line));
}

const DEFAULT_PREP_MAX_SPEND = 0.1;

/** The turn rounds' preparation modes (turnPrep.ts), each capped by the turn-rounds stage and --max-spend. */
function prepContext(args: Args, files: EvalFiles): PrepContext {
  requireApiKey();
  const caps = capsFor(args, files, "turn-rounds", DEFAULT_PREP_MAX_SPEND);
  return {
    files,
    caps,
    deps: (ledger) => runnerDeps(files, ledger),
    refuse: (stage, estimate) => refuseIfOverCaps(caps, files, stage, estimate),
    tpm: args.tpm,
    maxInFlight: MAX_IN_FLIGHT,
    log: (line) => console.log(line),
  };
}

function refuseIfOverCaps(caps: Caps, files: EvalFiles, stage: LedgerStage, estimate: number) {
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

/** Runner deps that append each attempt to calls.jsonl, or to prep-calls.jsonl for the rounds' own calls. */
function runnerDeps(files: EvalFiles, ledger: "calls" | "prep" = "calls") {
  return {
    execute: (spec: Parameters<typeof executeCall>[0]) => executeCall(spec, { outDir: files.outDir, now: Date.now }),
    record: (record: Parameters<EvalFiles["appendRecord"]>[0]) => {
      if (ledger === "prep") files.appendPrepRecord(record);
      else files.appendRecord(record);
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
  // Each build call is its own runner pass, so --max-spend is carried across them here
  let buildSpent = 0;
  const { cases, report } = await buildCases({
    ...localSources(dirs),
    callBaseline: async (role, caseId, request, players) => {
      const job = requestJob({ stage: "0", promptState: PRE_FIX_PROMPT_STATE, caseId, role, arm: baselineArm(role), players, request, records });
      const remaining: Caps = { ...caps, maxSpend: caps.maxSpend === undefined ? undefined : caps.maxSpend - buildSpent };
      const result = await runJobs([job], deps, { caps: remaining, previous: records, extraSpend: extraSpend(files), tokensPerMinute: args.tpm });
      buildSpent += result.records.reduce((sum, r) => sum + r.costUsd, 0);
      records.push(...result.records);
      if (result.stoppedReason) console.warn(`Stopped: ${result.stoppedReason}`);
      // The record that finished the job, from this invocation or an earlier one (never a stale rejected request)
      const final = finishingRecord(records, keyOf(job));
      return final && usable(final) ? files.loadOutput(final) : undefined;
    },
    log: (line) => console.log(line),
  });
  files.writeCases(cases, report);
  console.log(`Froze ${cases.length} cases. Thread types: ${JSON.stringify(report.threadTypes)}. Skipped: ${report.skipped.length}`);
  for (const line of report.skipped) console.log(`  skipped: ${line}`);
}

async function run(args: Args, files: EvalFiles) {
  if (!args.stage || !args.promptState) throw new UsageError("--run needs --stage and --prompt-state.");
  const retired = retiredPromptStateProblem(args.promptState);
  if (retired) throw new UsageError(retired);
  requireApiKey();
  if (!files.casesExist()) throw new UsageError("No frozen cases. Run --build-cases first.");
  const caps = capsFor(args, files, args.stage);
  const records = files.readRecords();
  const cases = files.readCases();
  const jobs = planJobs(cases, planOptions(args, args.stage, args.promptState, records));
  const finished = finishedJobKeys(records);
  const estimate = jobs.filter((j) => !finished.has(keyOf(j))).reduce((sum, j) => sum + jobEstimateUsd(j), 0);
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

/** results.md afresh from the stored records and outputs, after a reading changed (the stop rule of 2026-09-27); no API calls. */
function resultsMode(args: Args, files: EvalFiles) {
  if (!files.casesExist()) throw new UsageError("No frozen cases. Run --build-cases first.");
  writeResults(files, resolveCaps({ globalCap: args.globalCap }).caps, files.readCases());
  console.log(`Wrote results.md in ${files.outDir}`);
}

function writeResults(files: EvalFiles, caps: Caps, cases: EvalCase[]) {
  const records = files.readRecords();
  const { checks, prose } = checksForRecords(records, cases, files.loadOutput, files.loadReplyContent, files.loadPrompt);
  files.writeResults(
    renderResults({
      records,
      checks,
      tags: new Map(cases.map((c) => [c.id, c.tags])),
      caps,
      probe: files.readProbe(),
      filterCheckUsd: filterSpendUsd(files.readFilterRecords()),
      sideSpend: prepSpend(files.readPrepRecords()),
      prose,
      storedReference: rebuiltToday(cases),
      turnKinds: new Map(cases.flatMap((c) => {
        const kind = turnKindOf(c);
        return kind ? [[c.id, kind] as const] : [];
      })),
      generatedAt: new Date(),
    })
  );
}

/** The content filter's fixed test set on each arm, through the production filter path. */
async function filterCheck(args: Args, files: EvalFiles) {
  requireApiKey();
  const armKeys = args.armKeys?.length ? args.armKeys : DEFAULT_FILTER_ARMS;
  const arms = armKeys.map((key) => {
    const arm = FILTER_ARMS.find((a) => a.key === key);
    if (!arm) throw new UsageError(`Unknown filter arm ${key}; one of ${FILTER_ARMS.map((a) => a.key).join(", ")}`);
    return arm;
  });
  const caps = capsFor(args, files, "filter");
  // --fresh asks every case again (after a prompt, model or limit change); the ledger keeps every record
  const previous = args.fresh ? [] : files.readFilterRecords();
  // Priced as if every open case ran on every arm: an upper bound, never low
  refuseIfOverCaps(caps, files, "filter", filterCheckEstimateUsd(openFilterCases(FILTER_CASES, armKeys, previous), armKeys));
  const base = spentByStage([...files.readRecords(), ...extraSpend(files)]);
  const result = await runFilterCheck({
    cases: FILTER_CASES,
    arms,
    previous,
    deps: {
      classifierFor: (arm, fetch) => contentFilterClassifier(armSettings(arm), { configuration: { fetch } }),
      fetch: (input, init) => fetch(input, init),
      now: Date.now,
      record: (record) => files.appendFilterRecord(record),
      budget: (estimateUsd, invocationSpent) =>
        budgetCheck(
          caps,
          {
            byStage: { ...base.byStage, filter: base.byStage.filter + invocationSpent },
            total: base.total + invocationSpent,
          },
          invocationSpent,
          "filter",
          estimateUsd
        ),
      log: (line) => console.log(line),
    },
  });
  const records = files.readFilterRecords();
  // The report shows every arm with records; the console reads this run's arms
  const reported = FILTER_ARMS.map((a) => a.key).filter((key) => records.some((r) => r.armKey === key));
  const scores = scoreFilterCheck(records, FILTER_CASES, reported);
  files.writeFilterReport(renderFilterReport(scores, records, FILTER_CASES, new Date()));
  for (const s of scores.filter((score) => armKeys.includes(score.armKey))) {
    console.log(`${s.armKey}: ${s.passes ? "passes" : "fails"} (missed refusals: ${s.missedRefusals.join(", ") || "none"}; refused allowed: ${s.refusedAllowed.join(", ") || "none"}; unavailable: ${s.unavailable.join(", ") || "none"})`);
  }
  console.log(`${result.stoppedReason ? `Stopped: ${result.stoppedReason}` : "Filter check complete"}. This run spent $${filterSpendUsd(result.records).toFixed(4)}. Wrote filter-check.md.`);
}

/** `promptState:armKey` or a bare key in --prompt-state; a chain key ("pipeline:…") is never read as a state. */
function armRefs(args: Args, keys: string[] | undefined = args.armKeys): ArmRef[] {
  const promptState = args.promptState ?? "prefix";
  return (keys ?? []).map((ref) => {
    const colon = ref.indexOf(":");
    return colon > 0 && !ref.slice(0, colon).includes("@") && !ref.startsWith("pipeline:")
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
  const cases = files.casesExist() ? files.readCases() : (await localCases(localSources(dirs))).cases;
  const custom = loadStoryStates(dirs.storiesDir).filter((s) => !s.templateId);
  return { arms: [STORED_ARM], ...previewSource(kind, cases, custom) };
}

async function ratingPage(args: Args, files: EvalFiles, dirs: ReturnType<typeof guardEnvironment>) {
  const kind = args.ratingKind as RatingKind;
  const { arms, cases, records, loadOutput } = await ratingMaterial(args, files, dirs, kind);
  if (arms.length === 0) throw new UsageError("--rating-page needs --arms <baseline,candidate,…>.");
  if (arms.length === 1 && !args.preview) throw new UsageError("A real rating page needs at least two arms (or --preview).");
  if (args.pairwise && arms.length !== 2) {
    throw new UsageError("--pairwise needs exactly two arms: --arms <reference>,<candidate>.");
  }
  const items = args.items ?? (args.pairwise ? DEFAULT_PAIRWISE_ITEMS : DEFAULT_ITEMS)[kind];
  const chainArms = args.chainArmKeys?.length ? armRefs(args, args.chainArmKeys) : undefined;
  if (chainArms && (!args.pairwise || chainArms.length !== 2)) throw new UsageError("--chain-arms needs --pairwise and exactly two chains: <reference>,<candidate>.");
  const { set, key } = planRatingSet(
    {
      kind,
      arms,
      items,
      preview: args.preview,
      perItem: args.perItem,
      caseIds: args.caseIds,
      pairwise: args.pairwise,
      repeat: args.repeat,
      ...(chainArms ? { chainArms, chainItems: args.chainItems ?? DEFAULT_CHAIN_ITEMS } : {}),
    },
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

/** An existing page rendered afresh from its key, e.g. after a rendering fix; ratings in progress still apply. */
function rerenderPage(args: Args, files: EvalFiles) {
  const key = files.readKey(args.pageId as string);
  if (!key) throw new UsageError(`No answer key for page ${args.pageId} in ${files.at("keys")}.`);
  const set = ratingSetFromKey(key, files.readRecords(), files.readCases(), files.loadOutput);
  const html = renderRatingPage(set);
  const leaks = [...metadataLeaks(set), ...htmlLeaks(html, key)];
  if (leaks.length > 0) {
    throw new UsageError(`The page would reveal an arm; nothing written:\n  ${leaks.join("\n  ")}`);
  }
  const page = files.writeRatingPage(`${set.setId}-${set.pageId}.html`, html, false);
  console.log(`Re-rendered ${set.items.length} items to ${page} (key unchanged)`);
}

function score(args: Args, files: EvalFiles) {
  const exported = JSON.parse(fs.readFileSync(args.scoreFile as string, "utf-8")) as ExportedRatings;
  const key = files.readKey(exported.pageId);
  if (!key) throw new UsageError(`No answer key for page ${exported.pageId} in ${files.at("keys")}.`);
  if (key.mode === "pairwise") {
    const pairwise = scorePairwise(exported, key);
    files.writeScores(`${key.setId}-${key.pageId}`, renderPairwiseScores(pairwise), pairwise);
  } else {
    const scores = scoreRatings(exported, key);
    files.writeScores(`${key.setId}-${key.pageId}`, renderScores(scores), scores);
  }
  console.log(`Wrote scores/${key.setId}-${key.pageId}.md and .json`);
}

const READOUT_SAMPLES = 40;

/** The stat readouts on stored isolated beats, a hash-ordered sample for reading the check's false alarms by hand. */
function readoutSamples(records: CallRecord[], cases: EvalCase[], files: EvalFiles): BaselineReport["readouts"] {
  const byId = new Map(cases.map((c) => [c.id, c]));
  const hits = records.flatMap((r) => {
    const evalCase = byId.get(r.caseId);
    if (r.role !== "beat" || r.group !== "beat" || !r.final || !usable(r) || !r.outputFile || !evalCase?.state) return [];
    const output = files.loadOutput(r);
    if (output === undefined) return [];
    const story = caseStory(evalCase);
    const { reply } = repairBeatReply(story, output as SetOfBeatGenerationSchema);
    return statReadouts(story, reply).map((hit) => ({ arm: `${r.promptState}:${r.armKey}`, outputFile: r.outputFile as string, hit }));
  });
  return hits.sort((a, b) => sha256(`${a.outputFile}|${a.hit}`).localeCompare(sha256(`${b.outputFile}|${b.hit}`))).slice(0, READOUT_SAMPLES);
}

/** The new checks over every stored output, with their noise, the rated pages' picks, waits per turn kind and reference currency. */
function checkBaselinesMode(args: Args, files: EvalFiles) {
  const records = files.readRecords();
  const cases = files.readCases();
  const { checks, design } = checksForRecords(records, cases, files.loadOutput, files.loadReplyContent, files.loadPrompt);
  const rated = args.ratingsFiles.flatMap((file) => {
    const exported = JSON.parse(fs.readFileSync(file, "utf-8")) as ExportedRatings;
    const key = files.readKey(exported.pageId);
    if (!key) throw new UsageError(`No answer key for page ${exported.pageId} in ${files.at("keys")}.`);
    if (key.mode === "pairwise") {
      console.log(`  ${file}: a pairwise page; the rank-1 reading needs ranks, so it is left out`);
      return [];
    }
    return [{ key, exported }];
  });
  const report = checkBaselines({
    records,
    cases,
    design,
    all: checks,
    rated,
    // Today's production-form request for a case, as the executor hashes it; a case today's code cannot build has none
    todaysPromptHash: (evalCase) => todaysRequestHash(evalCase),
    readouts: readoutSamples(records, cases, files),
    generatedAt: new Date(),
  });
  files.writeCheckBaselines(renderCheckBaselines(report), report);
  console.log(`Checked ${report.replies} stored replies. Wrote check-baselines.md and .json in ${files.outDir}`);
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
    case "rerender-page":
      return rerenderPage(args, files);
    case "score":
      return score(args, files);
    case "filter-check":
      return filterCheck(args, files);
    case "check-baselines":
      return checkBaselinesMode(args, files);
    case "results":
      return resultsMode(args, files);
    case "build-round-cases":
      return buildRoundCasesMode(prepContext(args, files), args.rebuildCases);
    case "backfill-chapters":
      return backfillChaptersMode(prepContext(args, files));
    case "judge-calibration":
      return judgeCalibrationMode(prepContext(args, files), args.armKeys, args.samples ?? DEFAULT_JUDGE_SAMPLES);
    case "judge-records":
      return judgeRecordsMode(prepContext(args, files), args.armKeys, args.samples ?? DEFAULT_RECORD_JUDGE_SAMPLES, args.promptState ?? CURRENT_PROMPT_STATE);
    default:
      return dryRun(args, files, dirs);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
