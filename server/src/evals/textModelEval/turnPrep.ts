import type { PlayerSlot, SetOfBeatGenerationSchema } from "core/types/index.js";
import { repairBeatReply } from "../../game/services/beatRepairs.js";
import type { TextRequest } from "../../game/services/storyTextSteps.js";
import { productionArm, type Stage } from "./arms.js";
import type { Caps, LedgerStage, SpendRecord } from "./budget.js";
import { caseStory, type EvalCase } from "./cases.js";
import { backfillJobs, chapterFramesFile, collectChapters, type Chapter, type FrameSet } from "./chapterFrames.js";
import { FRAME_FILES, JUDGED_FILES, type EvalFiles } from "./evalFiles.js";
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
  judgedReadings,
  outputIdOf,
  renderCalibration,
  renderJudgedReadings,
  scoreCalibration,
  verdictsFrom,
  type CalibrationItem,
  type JudgedCheck,
  type JudgedItem,
  type JudgedTurn,
} from "./judgedChecks.js";
import {
  GROUP_JUDGE_CALIBRATION,
  GROUP_JUDGE_PROMPT_VERSION,
  groupEvidenceFrom,
  groupJudgeCaseId,
  groupJudgeJobs,
  groupJudgeRequest,
  groupReadings,
  groupVerdictsFrom,
  renderGroupJudge,
  scoreGroupCalibration,
  type JudgedReply,
} from "./groupJudge.js";
import { beatInput } from "./outputChecks.js";
import { finishedPrepRecord, prepArmKey, prepSpend } from "./prepCalls.js";
import { buildRoundCases, type RoundCall, type StoredLookup } from "./roundCases.js";
import { finishedJobKeys, finishingRecord, jobKey, keyOf, runJobs, usable, type CallRecord, type Job, type RunnerDeps } from "./runner.js";
import { referenceKeyOf } from "./variantComparison.js";
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
export const capsAfter = (caps: Caps, spent: number): Caps => ({ ...caps, maxSpend: caps.maxSpend === undefined ? undefined : caps.maxSpend - spent });

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

/**
 * The chapters every turn and planning case reads, and their backfill jobs
 * (Luna low, production's planner default): the first backfill in the turn
 * rounds' stage, or the nearer one in the stage given (the plan refresh).
 */
export function backfillPlan(cases: EvalCase[], frames: FrameSet = "backfilled", stage?: Stage) {
  const chapters = collectChapters(cases);
  return { chapters, jobs: backfillJobs(chapters, productionArm("thread", 1), CURRENT_PROMPT_STATE, { frames, ...(stage ? { stage } : {}) }) };
}

/** The backfill jobs a run sends: every chapter's, or with --cases (a smoke) those of the chapters the cases read. */
export function backfillJobsToRun(chapters: Chapter[], jobs: Job[], caseIds?: string[]): Job[] {
  return caseIds ? jobs.filter((_, i) => chapters[i].readBy.some((id) => caseIds.includes(id))) : jobs;
}

export async function backfillChaptersMode(ctx: PrepContext, options: { frames?: FrameSet; stage?: LedgerStage; caseIds?: string[] } = {}): Promise<void> {
  const { files, log } = ctx;
  const frames = options.frames ?? "backfilled";
  const stage = options.stage ?? STAGE;
  const { chapters, jobs } = backfillPlan(files.readCases(), frames, stage as Stage);
  const previous = files.readPrepRecords();
  const done = finishedJobKeys(previous);
  const toRun = backfillJobsToRun(chapters, jobs, options.caseIds);
  const open = toRun.filter((j) => !done.has(keyOf(j)));
  const estimate = open.reduce((sum, j) => sum + jobEstimateUsd(j), 0);
  ctx.refuse(stage, estimate);
  log(`${chapters.length} chapters (${chapters.filter((c) => c.exactInput).length} from the planner's own input), ${frames} frames in stage ${stage}, ${toRun.length} to run, ${open.length} open, est $${estimate.toFixed(3)}`);
  // The frames file is written over every chapter, whatever this run sent
  const result = await runJobs(toRun, ctx.deps("prep"), {
    caps: ctx.caps,
    previous,
    extraSpend: spendBeside(files, "prep"),
    tokensPerMinute: ctx.tpm,
    maxInFlight: ctx.maxInFlight,
  });
  const file = chapterFramesFile(chapters, jobs, files.readPrepRecords(), files.loadOutput, new Date(), frames);
  files.writeChapterFrames(file, frames);
  const readBy = (n: number) => file.chapters.reduce((sum, c) => sum + c.readBy.length, n);
  log(
    `${result.stoppedReason ? `Stopped: ${result.stoppedReason}. ` : ""}Framed ${file.chapters.length} chapters, read by ${readBy(0)} cases; ${file.missing.length} without a frame. This run spent $${sumCost(result.records).toFixed(4)}. Wrote ${FRAME_FILES[frames]}.`
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

// --- --judge-records ---

export type RoundTurn = {
  armKey: string;
  caseId: string;
  sample: number;
  slot: PlayerSlot;
  outputId: string;
  checks: JudgedCheck[];
  request: TextRequest;
  /** Judged on its chapter's nearer frame, which changed the request (the reruns); its judge call is keyed apart */
  frameTag?: "nearer";
};

/**
 * The judge requests for a round's turns: every final usable beat record of
 * the named arms in the prompt state (an isolated beat, or a chain's beat on
 * the chain's own plan), on chapter steps only, one per player, each on the
 * turn as the game keeps it (the beat repairs) with its chapter's frame: the
 * first backfill's, or (frames "nearer", the reruns of 2026-09-28) the nearer
 * one, tagged where it changes the request, so a turn whose chapter has none
 * (a chain's own plan, a first turn) reuses its judge call.
 */
export function roundTurnsToJudge(
  records: CallRecord[],
  cases: EvalCase[],
  load: (record: CallRecord) => unknown,
  armKeys: string[],
  promptState: string,
  frames: FrameSet = "backfilled"
): { turns: RoundTurn[]; problems: string[] } {
  const byId = new Map(cases.map((c) => [c.id, c]));
  const problems: string[] = [];
  const turns = records.flatMap((r): RoundTurn[] => {
    const isTurn = (r.group === "beat" && r.role === "beat") || (r.group === "pipeline" && r.step === 2);
    if (!isTurn || !r.final || !usable(r) || !r.outputFile || r.promptState !== promptState || !armKeys.includes(r.armKey)) return [];
    const evalCase = byId.get(r.caseId);
    if (!evalCase) {
      problems.push(`${r.caseId}: no frozen case for ${r.armKey}`);
      return [];
    }
    // Every turn a judged check applies to (judgedChecksFor): chapter steps get all three, switch turns and endings the
    // first paragraph (turn round 2), a first turn none
    const story = beatInput(r, evalCase, records, load);
    const { reply } = repairBeatReply(story, load(r) as SetOfBeatGenerationSchema);
    return story.getPlayerSlots().flatMap((slot) => {
      const judged = judgeRequest(story, reply, slot, evalCase.chapterFrames);
      if (!judged) return [];
      const nearer = frames === "nearer" ? judgeRequest(story, reply, slot, evalCase.nearerFrames) : undefined;
      const tagged = nearer !== undefined && nearer.request.prompt !== judged.request.prompt;
      const used = tagged ? nearer : judged;
      return [
        {
          armKey: r.armKey,
          caseId: r.caseId,
          sample: r.sample,
          slot,
          outputId: outputIdOf(r.outputFile as string),
          checks: used.checks,
          request: used.request,
          ...(tagged ? { frameTag: "nearer" as const } : {}),
        },
      ];
    });
  });
  return { turns, problems };
}

export const DEFAULT_RECORD_JUDGE_SAMPLES = 1;

/**
 * The turns a --judge-records run sends new judge calls for: samples 1 and 2,
 * the ones a comparison pairs (a reference's reruns for the waits, sample 3
 * on, need no judge), and with --cases only those cases (turn round 2, which
 * had money for its retest's chapter steps only). Turns already judged are
 * read whatever their sample.
 */
export function turnsToSend(turns: RoundTurn[], caseIds?: string[]): RoundTurn[] {
  return turns.filter((t) => t.sample <= 2 && (!caseIds || caseIds.includes(t.caseId)));
}

export type JudgeRecordsOptions = {
  caseIds?: string[];
  /** The frames the judge reads: the first backfill's (the rounds), or the nearer ones (the reruns) */
  frames?: FrameSet;
  /** The ledger stage the new judge calls book to: turn-rounds, or a feedback run's own (the reruns) */
  stage?: LedgerStage;
};

/**
 * Judges a round's turns (turn round 1: the reference and the candidates),
 * then writes judged-turns.md and .json, or on the nearer frames
 * judged-turns-nearer.md and .json beside them.
 */
export async function judgeRecordsMode(ctx: PrepContext, armKeys: string[] | undefined, samples: number, promptState: string, options: JudgeRecordsOptions = {}): Promise<void> {
  const { files, log } = ctx;
  if (!armKeys?.length) throw new Error("--judge-records needs --arms: the beat or chain arms whose chapter steps to judge");
  const frames = options.frames ?? "backfilled";
  const stage = options.stage ?? STAGE;
  const records = files.readRecords();
  const cases = files.readCases();
  const { turns, problems } = roundTurnsToJudge(records, cases, files.loadOutput, armKeys, promptState, frames);
  const arm = JUDGE_ARMS[0];
  const jobs = judgeJobs(turnsToSend(turns, options.caseIds), arm, samples, promptState, stage as Stage);
  const done = finishedJobKeys(files.readPrepRecords());
  const open = jobs.filter((j) => !done.has(keyOf(j)));
  const estimate = open.reduce((sum, j) => sum + jobEstimateUsd(j), 0);
  ctx.refuse(stage, estimate);
  log(`${turns.length} turns of ${armKeys.length} arms × ${samples} samples on ${arm.key} (${frames} frames, stage ${stage}), ${open.length} open, est $${estimate.toFixed(3)}`);
  const result = await runJobs(jobs, ctx.deps("prep"), {
    caps: ctx.caps,
    previous: files.readPrepRecords(),
    extraSpend: spendBeside(files, "prep"),
    tokensPerMinute: ctx.tpm,
    maxInFlight: ctx.maxInFlight,
  });
  if (result.stoppedReason) log(`Stopped: ${result.stoppedReason}`);
  writeJudgedTurns(files, turns, problems, promptState, frames, log);
}

function writeJudgedTurns(files: EvalFiles, turns: RoundTurn[], problems: string[], promptState: string, frames: FrameSet, log: (line: string) => void) {
  const prep = files.readPrepRecords();
  const arm = JUDGE_ARMS[0];
  const caseIdOf = (t: RoundTurn) => judgeCaseId(t.outputId, t.slot, JUDGE_PROMPT_VERSION, t.frameTag);
  const judged: JudgedTurn[] = turns.flatMap((turn) => {
    const record = finishedPrepRecord(prep, jobKey(caseIdOf(turn), prepArmKey("judge", arm), promptState, 1));
    if (!record) return [];
    const { request, frameTag, ...rest } = turn;
    void request;
    void frameTag;
    return [{ ...rest, verdicts: verdictsFrom(files.loadOutput(record), turn.checks) }];
  });
  const readings = judgedReadings(judged, referenceKeyOf);
  const spentUsd = sumCost(prep.filter((r) => r.armKey.startsWith("judge>") && turns.some((t) => r.caseId === caseIdOf(t))));
  const generatedAt = new Date();
  files.writeJudgedTurns(renderJudgedReadings(readings, { spentUsd, generatedAt, problems }), { generatedAt: generatedAt.toISOString(), promptState, frames, readings, judged, problems, spentUsd }, frames);
  log(`Judged ${judged.length} of ${turns.length} turns; these judge calls $${spentUsd.toFixed(4)}. Wrote ${JUDGED_FILES[frames]}.md and .json.`);
}

// --- --judge-groups (the group round, B10) ---

export type GroupReply = { armKey: string; caseId: string; sample: number; outputId: string; request: TextRequest };

/**
 * The group judge's requests for a round's group replies: every final usable
 * isolated beat record of the named arms in the prompt state, samples 1 and 2
 * (the ones a comparison pairs), whose story has several players, on the
 * reply as the game keeps it (the beat repairs).
 */
export function groupRepliesToJudge(
  records: CallRecord[],
  cases: EvalCase[],
  load: (record: CallRecord) => unknown,
  armKeys: string[],
  promptState: string
): { replies: GroupReply[]; problems: string[] } {
  const byId = new Map(cases.map((c) => [c.id, c]));
  const problems: string[] = [];
  const replies = records.flatMap((r): GroupReply[] => {
    if (r.group !== "beat" || r.role !== "beat" || !r.final || !usable(r) || !r.outputFile || r.promptState !== promptState || !armKeys.includes(r.armKey) || r.sample > 2) return [];
    const evalCase = byId.get(r.caseId);
    if (!evalCase) {
      problems.push(`${r.caseId}: no frozen case for ${r.armKey}`);
      return [];
    }
    const story = beatInput(r, evalCase, records, load);
    if (!story.isMultiplayer()) return [];
    const { reply } = repairBeatReply(story, load(r) as SetOfBeatGenerationSchema);
    const request = groupJudgeRequest(story, reply);
    if (!request) {
      problems.push(`${r.caseId} ${r.armKey} s${r.sample}: fewer than two turns to judge`);
      return [];
    }
    return [{ armKey: r.armKey, caseId: r.caseId, sample: r.sample, outputId: outputIdOf(r.outputFile), request }];
  });
  return { replies, problems };
}

/** Each reply once, the calibration's stored turns at two samples (the judge's self-agreement), the rest at one. */
export function withCalibrationSamples(replies: GroupReply[]): { outputId: string; request: TextRequest; samples: number }[] {
  const calibrated = new Set(GROUP_JUDGE_CALIBRATION.map((item) => item.outputId));
  const byOutput = new Map<string, { outputId: string; request: TextRequest; samples: number }>();
  for (const reply of replies) {
    if (!byOutput.has(reply.outputId)) byOutput.set(reply.outputId, { outputId: reply.outputId, request: reply.request, samples: calibrated.has(reply.outputId) ? 2 : 1 });
  }
  return [...byOutput.values()];
}

/**
 * The group round's judged check (groupJudge.ts): the calibration on today's
 * stored group turns (the reference's sample 1, judged twice) and every group
 * reply of the named arms once, booked to the stage given (groups), then
 * judged-groups.md and .json. The reference must be among the arms, since
 * its sample-1 replies are the calibration set.
 */
export async function judgeGroupsMode(ctx: PrepContext, armKeys: string[] | undefined, promptState: string, options: { stage?: LedgerStage } = {}): Promise<void> {
  const { files, log } = ctx;
  if (!armKeys?.length) throw new Error("--judge-groups needs --arms: the group turn arms to judge, the reference first (its stored turns are the calibration set)");
  const stage = options.stage ?? "groups";
  const records = files.readRecords();
  const { replies, problems } = groupRepliesToJudge(records, files.readCases(), files.loadOutput, armKeys, promptState);
  const missing = GROUP_JUDGE_CALIBRATION.filter((item) => !replies.some((r) => r.outputId === item.outputId));
  for (const item of missing) problems.push(`${item.caseId}: the calibration turn ${item.outputId} is not among the arms' replies`);
  const arm = JUDGE_ARMS[0];
  const jobs = groupJudgeJobs(withCalibrationSamples(replies), arm, promptState, stage as Stage);
  const done = finishedJobKeys(files.readPrepRecords());
  const open = jobs.filter((j) => !done.has(keyOf(j)));
  const estimate = open.reduce((sum, j) => sum + jobEstimateUsd(j), 0);
  ctx.refuse(stage, estimate);
  log(`${replies.length} group replies of ${armKeys.length} arms on ${arm.key} (stage ${stage}), ${jobs.length} calls, ${open.length} open, est $${estimate.toFixed(3)}`);
  const result = await runJobs(jobs, ctx.deps("prep"), { caps: ctx.caps, previous: files.readPrepRecords(), extraSpend: spendBeside(files, "prep"), tokensPerMinute: ctx.tpm, maxInFlight: ctx.maxInFlight });
  if (result.stoppedReason) log(`Stopped: ${result.stoppedReason}`);
  writeJudgedGroups(files, replies, problems, promptState, log);
}

function writeJudgedGroups(files: EvalFiles, replies: GroupReply[], problems: string[], promptState: string, log: (line: string) => void) {
  const prep = files.readPrepRecords();
  const arm = JUDGE_ARMS[0];
  const parsedAt = (outputId: string, sample: number) => {
    const record = finishedPrepRecord(prep, jobKey(groupJudgeCaseId(outputId), prepArmKey("judge", arm), promptState, sample));
    return record ? files.loadOutput(record) : undefined;
  };
  const judged: JudgedReply[] = replies.flatMap((reply) => {
    const parsed = parsedAt(reply.outputId, 1);
    return parsed === undefined ? [] : [{ armKey: reply.armKey, caseId: reply.caseId, sample: reply.sample, outputId: reply.outputId, verdicts: groupVerdictsFrom(parsed) }];
  });
  const calibrationJudged = GROUP_JUDGE_CALIBRATION.map((item) => {
    const parsed = [1, 2].map((sample) => parsedAt(item.outputId, sample)).filter((p) => p !== undefined);
    return { itemId: item.id, samples: parsed.map(groupVerdictsFrom), evidence: parsed.map(groupEvidenceFrom) };
  });
  const calibration = scoreGroupCalibration(GROUP_JUDGE_CALIBRATION, calibrationJudged);
  const readings = groupReadings(judged, referenceKeyOf);
  const spentUsd = sumCost(prep.filter((r) => r.caseId.startsWith("judge-group-")));
  const generatedAt = new Date();
  files.writeJudgedGroups(
    renderGroupJudge({ items: GROUP_JUDGE_CALIBRATION, calibration, readings, judged: calibrationJudged, spentUsd, generatedAt, problems }),
    { generatedAt: generatedAt.toISOString(), promptState, promptVersion: GROUP_JUDGE_PROMPT_VERSION, calibration, calibrationJudged, readings, judged, problems, spentUsd }
  );
  for (const a of calibration) log(`${a.check}: ${a.agree} of ${a.decided} agree, samples ${a.pairsAgree} of ${a.pairs}: ${a.reliable ? "reliable" : "not reliable"}`);
  log(`Judged ${judged.length} of ${replies.length} group replies; group judge calls $${spentUsd.toFixed(4)}. Wrote judged-groups.md and .json.`);
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
  const nearer = backfillPlan(cases, "nearer", "plan-refresh");
  log(
    `The nearer chapter backfill (--backfill-chapters --frames nearer --stage plan-refresh): ${nearer.chapters.length} chapters, ${openCost(nearer.jobs)}; cases with a nearer frame ${cases.filter((c) => c.nearerFrames).length}`
  );
  const { turns, problems } = calibrationTurns(files);
  const arm = JUDGE_ARMS[0];
  log(`  Judge calibration (--judge-calibration): ${turns.length} hand-read turns on ${arm.key} × ${DEFAULT_JUDGE_SAMPLES}, ${openCost(judgeJobs(turns, arm, DEFAULT_JUDGE_SAMPLES, CURRENT_PROMPT_STATE))}${problems.length ? `; ${problems.length} unusable` : ""}`);
  log(`  Prep calls so far: $${sumCost(prep).toFixed(4)} (prep-calls.jsonl)`);
  const chain = prep.filter((r) => r.armKey.startsWith("chain>"));
  log(`Setup round 3's chain (--setup-chain, stage setup-rounds): ${chain.length} attempts so far, $${sumCost(chain).toFixed(4)} (in prep-calls.jsonl)`);
}
