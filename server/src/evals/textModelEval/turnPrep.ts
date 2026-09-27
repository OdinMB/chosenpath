import type { SetOfBeatGenerationSchema } from "core/types/index.js";
import { repairBeatReply } from "../../game/services/beatRepairs.js";
import type { TextRequest } from "../../game/services/storyTextSteps.js";
import { productionArm } from "./arms.js";
import type { Caps, LedgerStage, SpendRecord } from "./budget.js";
import { caseStory, type EvalCase } from "./cases.js";
import { backfillJobs, chapterFramesFile, collectChapters } from "./chapterFrames.js";
import type { EvalFiles } from "./evalFiles.js";
import { sha256 } from "./executor.js";
import { filterSpendUsd } from "./filterCheck.js";
import { jobEstimateUsd, requestJob } from "./jobPlan.js";
import {
  DEFAULT_JUDGE_ARM,
  JUDGE_ARMS,
  JUDGE_CALIBRATION,
  JUDGE_PROMPT_VERSION,
  evidenceFrom,
  judgeCaseId,
  judgeJobs,
  judgeRequest,
  outputIdOf,
  renderCalibration,
  scoreCalibration,
  verdictsFrom,
  type CalibrationItem,
  type JudgedCheck,
  type JudgedItem,
} from "./judgedChecks.js";
import { finishedPrepRecord, prepArmKey, prepSpend } from "./prepCalls.js";
import { buildRoundCases, type RoundCall, type StoredLookup } from "./roundCases.js";
import { finishedJobKeys, finishingRecord, jobKey, keyOf, runJobs, usable, type Job, type RunnerDeps } from "./runner.js";
import { CURRENT_PROMPT_STATE, requestText } from "./variants.js";

/*
 * The CLI modes of the turn rounds' preparation (turn doc section 4, "Before
 * round 1", items 4 to 6), kept out of run.ts:
 * - --build-round-cases: roundCases.ts, frozen beside the other cases; its
 *   few new calls are production-form calls, recorded in calls.jsonl;
 * - --backfill-chapters: chapterFrames.ts, one Luna low call per chapter,
 *   into prep-calls.jsonl, then chapter-frames.json;
 * - --judge-calibration: judgedChecks.ts on the hand-read turns, into
 *   prep-calls.jsonl, then judge-calibration.md and .json.
 * Every call counts against the turn-rounds stage and the global cap.
 */

export type PrepContext = {
  files: EvalFiles;
  caps: Caps;
  /** Runner deps that append each record to calls.jsonl or to prep-calls.jsonl */
  deps: (ledger: "calls" | "prep") => RunnerDeps;
  /** Throws when the estimate would pass a cap (nothing is sent) */
  refuse: (stage: LedgerStage, estimateUsd: number) => void;
  tpm: number;
  maxInFlight: number;
  log: (line: string) => void;
};

const STAGE: LedgerStage = "turn-rounds";
const sumCost = (records: { costUsd: number }[]) => records.reduce((sum, r) => sum + r.costUsd, 0);

/** The caps for a mode's next runner pass: --max-spend covers the whole invocation, so what earlier passes spent comes off it. */
const capsAfter = (caps: Caps, spent: number): Caps => ({ ...caps, maxSpend: caps.maxSpend === undefined ? undefined : caps.maxSpend - spent });

/** Ledger spend beside the file a mode appends to: the probe, the filter check, and the other call ledger. */
export function spendBeside(files: EvalFiles, writing: "calls" | "prep"): SpendRecord[] {
  const probe = files.readProbe();
  const probeSpend: SpendRecord[] = probe ? [{ stage: "0", costUsd: probe.totalCostUsd + (probe.priorSpendUsd ?? 0) }] : [];
  const other = writing === "calls" ? files.readPrepRecords() : files.readRecords();
  return [...probeSpend, { stage: "filter", costUsd: filterSpendUsd(files.readFilterRecords()) }, ...prepSpend(other)];
}

// --- --build-round-cases ---

export async function buildRoundCasesMode(ctx: PrepContext, replace: boolean): Promise<void> {
  const { files, log } = ctx;
  if (!files.casesExist()) throw new Error("No frozen cases. Run --build-cases first.");
  const frozen = files.readCases();
  const built = frozen.filter((c) => c.tags.source === "round");
  if (built.length > 0 && !replace) {
    throw new Error(`${built.length} round cases are already frozen. --rebuild-cases replaces them (their choices and new calls would change).`);
  }
  const records = files.readRecords();
  let spent = 0;
  const call: RoundCall = async (role, caseId, request, players) => {
    const job = requestJob({ stage: "turn-rounds", promptState: CURRENT_PROMPT_STATE, caseId, role, arm: productionArm(role, players), players, request, records });
    const key = keyOf(job);
    // A finished call under this id is reused only on the very same prompt: the build's dice set every later state
    const earlier = finishingRecord(records, key);
    if (earlier?.promptHash && earlier.promptHash !== sha256(requestText(request))) {
      throw new Error(`${caseId}: a call under this id was made on a different state; remove its records from calls.jsonl or rebuild under new ids.`);
    }
    const result = await runJobs([job], ctx.deps("calls"), { caps: capsAfter(ctx.caps, spent), previous: records, extraSpend: spendBeside(files, "calls"), tokensPerMinute: ctx.tpm });
    spent += sumCost(result.records);
    records.push(...result.records);
    if (result.stoppedReason) log(`Stopped: ${result.stoppedReason}`);
    const final = finishingRecord(records, key);
    return final && usable(final) && final.outputFile ? { parsed: files.loadOutput(final), outputFile: final.outputFile } : undefined;
  };
  const stored: StoredLookup = (source, step) => {
    const key = jobKey(source.caseId, source.armKey, source.promptState, source.sample);
    const record = records.find((r) => r.jobKey === key && r.step === step && r.final && usable(r) && r.outputFile);
    return record?.outputFile ? { parsed: files.loadOutput(record), outputFile: record.outputFile } : undefined;
  };
  const { cases, report } = await buildRoundCases({ frozen: frozen.filter((c) => c.tags.source !== "round"), stored, call, log });
  files.addCases(cases, report, replace);
  log(`Froze ${cases.length} round cases (${report.problems.length} problems). This run spent $${spent.toFixed(4)}.`);
}

// --- --backfill-chapters ---

/** The chapters every turn and planning case reads, and their backfill jobs (Luna low, production's planner default). */
function backfillPlan(cases: EvalCase[]) {
  const chapters = collectChapters(cases);
  return { chapters, jobs: backfillJobs(chapters, productionArm("thread", 1), CURRENT_PROMPT_STATE) };
}

export async function backfillChaptersMode(ctx: PrepContext): Promise<void> {
  const { files, log } = ctx;
  const { chapters, jobs } = backfillPlan(files.readCases());
  const previous = files.readPrepRecords();
  const done = finishedJobKeys(previous);
  const open = jobs.filter((j) => !done.has(keyOf(j)));
  const estimate = open.reduce((sum, j) => sum + jobEstimateUsd(j), 0);
  ctx.refuse(STAGE, estimate);
  log(`${chapters.length} chapters (${chapters.filter((c) => c.exactInput).length} from the planner's own input), ${open.length} open, est $${estimate.toFixed(3)}`);
  const result = await runJobs(jobs, ctx.deps("prep"), {
    caps: ctx.caps,
    previous,
    extraSpend: spendBeside(files, "prep"),
    tokensPerMinute: ctx.tpm,
    maxInFlight: ctx.maxInFlight,
  });
  const file = chapterFramesFile(chapters, jobs, files.readPrepRecords(), files.loadOutput, new Date());
  files.writeChapterFrames(file);
  const readBy = (n: number) => file.chapters.reduce((sum, c) => sum + c.readBy.length, n);
  log(
    `${result.stoppedReason ? `Stopped: ${result.stoppedReason}. ` : ""}Framed ${file.chapters.length} chapters, read by ${readBy(0)} cases; ${file.missing.length} without a frame. This run spent $${sumCost(result.records).toFixed(4)}. Wrote chapter-frames.json.`
  );
}

// --- --judge-calibration ---

type CalibrationTurn = { item: CalibrationItem; outputId: string; slot: CalibrationItem["slot"]; checks: JudgedCheck[]; request: TextRequest };

/** Each hand-read turn's judge request, built on the case as the turn saw it (with its chapter's frame, when backfilled). */
function calibrationTurns(files: EvalFiles): { turns: CalibrationTurn[]; problems: string[] } {
  const records = files.readRecords();
  const byId = new Map(files.readCases().map((c) => [c.id, c]));
  const problems: string[] = [];
  const turns = JUDGE_CALIBRATION.flatMap((item) => {
    const record = records.find((r) => r.outputFile && outputIdOf(r.outputFile) === item.outputId);
    const evalCase = record ? byId.get(record.caseId) : undefined;
    if (!record || !evalCase || record.group !== "beat") {
      problems.push(`${item.id}: no isolated beat record or case for ${item.outputId}`);
      return [];
    }
    const story = caseStory(evalCase);
    const { reply } = repairBeatReply(story, files.loadOutput(record) as SetOfBeatGenerationSchema);
    const judged = judgeRequest(story, reply, item.slot, evalCase.chapterFrames);
    if (!judged) {
      problems.push(`${item.id}: no judged check applies to this turn`);
      return [];
    }
    return [{ item, outputId: item.outputId, slot: item.slot, checks: judged.checks, request: judged.request }];
  });
  return { turns, problems };
}

export const DEFAULT_JUDGE_SAMPLES = 2;

export async function judgeCalibrationMode(ctx: PrepContext, armKeys: string[] | undefined, samples: number): Promise<void> {
  const { files, log } = ctx;
  const arms = (armKeys?.length ? armKeys : [DEFAULT_JUDGE_ARM]).map((key) => {
    const arm = JUDGE_ARMS.find((a) => a.key === key || a.key === `${key}/prod`);
    if (!arm) throw new Error(`Unknown judge ${key}; one of ${JUDGE_ARMS.map((a) => a.key).join(", ")}`);
    return arm;
  });
  const { turns, problems } = calibrationTurns(files);
  const done = finishedJobKeys(files.readPrepRecords());
  const planned = arms.map((arm) => {
    const jobs = judgeJobs(turns, arm, samples, CURRENT_PROMPT_STATE);
    const open = jobs.filter((j) => !done.has(keyOf(j)));
    return { arm, jobs, open: open.length, estimate: open.reduce((sum, j) => sum + jobEstimateUsd(j), 0) };
  });
  // One refusal for the whole invocation, before anything is sent; each judge then runs on what the earlier ones left
  ctx.refuse(STAGE, planned.reduce((sum, p) => sum + p.estimate, 0));
  let spent = 0;
  for (const { arm, jobs, open, estimate } of planned) {
    log(`${arm.key}: ${turns.length} turns × ${samples} samples, ${open} open, est $${estimate.toFixed(3)}`);
    const result = await runJobs(jobs, ctx.deps("prep"), {
      caps: capsAfter(ctx.caps, spent),
      previous: files.readPrepRecords(),
      extraSpend: spendBeside(files, "prep"),
      tokensPerMinute: ctx.tpm,
      maxInFlight: ctx.maxInFlight,
    });
    spent += sumCost(result.records);
    if (result.stoppedReason) log(`Stopped: ${result.stoppedReason}`);
  }
  writeCalibration(files, turns, problems, log);
}

/**
 * judge-calibration.md and .json over every judge arm and prompt version
 * with records, the current version first, whichever this run asked for.
 */
function writeCalibration(files: EvalFiles, turns: CalibrationTurn[], problems: string[], log: (line: string) => void) {
  const prep = files.readPrepRecords();
  const judgeRecords = prep.filter((r) => r.armKey.startsWith("judge>"));
  const versions = Array.from({ length: JUDGE_PROMPT_VERSION }, (_, i) => JUDGE_PROMPT_VERSION - i);
  const judges = versions.flatMap((version) =>
    JUDGE_ARMS.filter((arm) => turns.some((t) => judgeRecords.some((r) => r.caseId === judgeCaseId(t.outputId, t.slot, version) && r.callArmKey === arm.key))).map((arm) => ({
      arm,
      version,
      label: `${arm.key}, prompt v${version}`,
    }))
  );
  const judged: JudgedItem[] = judges.flatMap(({ arm, version, label }) =>
    turns.map((turn) => {
      const caseId = judgeCaseId(turn.outputId, turn.slot, version);
      const sampled = [...new Set(judgeRecords.filter((r) => r.caseId === caseId && r.callArmKey === arm.key).map((r) => r.sample))].sort((a, b) => a - b);
      const parsed = sampled.map((sample) => {
        const record = finishedPrepRecord(prep, jobKey(caseId, prepArmKey("judge", arm), CURRENT_PROMPT_STATE, sample));
        return record ? files.loadOutput(record) : undefined;
      });
      return {
        itemId: turn.item.id,
        armKey: label,
        samples: parsed.map((p) => verdictsFrom(p, turn.checks)),
        evidence: parsed.map((p) => evidenceFrom(p, turn.checks)),
      };
    })
  );
  const labels = judges.map((j) => j.label);
  const spentUsd = sumCost(judgeRecords);
  const generatedAt = new Date();
  const scores = Object.fromEntries(labels.map((label) => [label, scoreCalibration(JUDGE_CALIBRATION, judged, label)]));
  files.writeJudgeCalibration(renderCalibration({ items: JUDGE_CALIBRATION, judged, armKeys: labels, spentUsd, generatedAt, problems }), {
    generatedAt: generatedAt.toISOString(),
    promptVersion: JUDGE_PROMPT_VERSION,
    items: JUDGE_CALIBRATION,
    judged,
    scores,
    problems,
    spentUsd,
  });
  for (const { label, version } of judges.filter((j) => j.version === JUDGE_PROMPT_VERSION)) {
    for (const a of scores[label]) log(`${label} ${a.check}: ${a.agree} of ${a.decided} agree, samples ${a.pairsAgree} of ${a.pairs}: ${a.reliable ? "reliable" : "not reliable"} (v${version})`);
  }
  log(`Judge calls so far $${spentUsd.toFixed(4)}. Wrote judge-calibration.md and .json.`);
}

// --- The dry run's view ---

/** What the preparation modes would still send, and what they have spent (no API calls). */
export function printPrepPlan(files: EvalFiles, log: (line: string) => void): void {
  if (!files.casesExist()) return;
  const cases = files.readCases();
  const prep = files.readPrepRecords();
  const done = finishedJobKeys(prep);
  const openCost = (jobs: Job[]) => {
    const open = jobs.filter((j) => !done.has(keyOf(j)));
    return `${open.length} open, est $${open.reduce((sum, j) => sum + jobEstimateUsd(j), 0).toFixed(3)}`;
  };
  const round = cases.filter((c) => c.tags.source === "round");
  log("\nTurn-round preparation (stage turn-rounds):");
  log(`  Round cases (--build-round-cases): ${round.length ? `${round.length} frozen` : "not built yet (about 5 new calls, about $0.02)"}`);
  const { chapters, jobs } = backfillPlan(cases);
  const framed = cases.filter((c) => c.tags.chapterFrame === "backfilled").length;
  const fallback = cases.filter((c) => c.tags.chapterFrame === "fallback").length;
  log(`  Chapter backfill (--backfill-chapters): ${chapters.length} chapters, ${openCost(jobs)}; cases backfilled ${framed}, fallback ${fallback}`);
  const { turns, problems } = calibrationTurns(files);
  const arm = JUDGE_ARMS[0];
  log(`  Judge calibration (--judge-calibration): ${turns.length} hand-read turns on ${arm.key} × ${DEFAULT_JUDGE_SAMPLES}, ${openCost(judgeJobs(turns, arm, DEFAULT_JUDGE_SAMPLES, CURRENT_PROMPT_STATE))}${problems.length ? `; ${problems.length} unusable` : ""}`);
  log(`  Prep calls so far: $${sumCost(prep).toFixed(4)} (prep-calls.jsonl)`);
}
