import type { SetOfBeatGenerationSchema } from "core/types/index.js";
import { repairBeatReply } from "../../game/services/beatRepairs.js";
import { armKey, RECORDED_RESULT_CASES, RECORDED_RESULT_PROMPT_STATE, secondReferenceKeys, type Stage } from "./arms.js";
import { caseStory, type EvalCase } from "./cases.js";
import { replyVerdict } from "./endingJudge.js";
import { jobEstimateUsd } from "./jobPlan.js";
import { JUDGE_ARMS, outputIdOf } from "./judgedChecks.js";
import { withEdits } from "./outcomeSettledPrep.js";
import { playthroughRunsFrom } from "./playthroughMode.js";
import { replayedTurn } from "./playthroughReplay.js";
import type { PlayRun } from "./playthroughs.js";
import { finishedPrepRecord, prepArmKey } from "./prepCalls.js";
import { recordedResultCasesToFreeze } from "./recordedResultCases.js";
import {
  RECORDED_CALIBRATION,
  RECORDED_JUDGE_PROMPT_VERSION,
  recordedEvidenceFrom,
  recordedJudgeCaseId,
  recordedJudgeJobs,
  recordedJudgeRequests,
  recordedVerdictFrom,
  renderRecordedJudge,
  scoreRecordedCalibration,
  type RecordedCalibrationItem,
  type RecordedFailure,
  type RecordedTarget,
} from "./recordedResultJudge.js";
import { finishedJobKeys, jobKey, keyOf, runJobs, usable, type CallRecord } from "./runner.js";
import { stageReadings, type JudgedPlan } from "./stageJudge.js";
import { spendBeside, type PrepContext } from "./turnPrep.js";
import { referenceKeyOf } from "./variantComparison.js";

/*
 * The recorded-result stage's CLI modes (2026-09-30, fix 2 of the second
 * playthroughs' review), kept out of run.ts:
 * - --build-recorded-cases: the stage's cases from the second round's stored
 *   runs (recordedResultCases.ts), each only where its request is the one
 *   production sent there, frozen beside the others (those already frozen
 *   left as they are, unless --rebuild-cases); no calls;
 * - --judge-recorded: the stage's judged check, into prep-calls.jsonl, booked
 *   to the stage, then judged-recorded.md and .json: recordedResultTold
 *   (recordedResultJudge.ts) on its calibration (two samples) and on every
 *   reply of the stage's arms under adopted9 (one sample), one call per
 *   player in an exploration thread whose recorded result the turn narrates.
 *   A reply is read as the game keeps it (the beat repairs); a calibration
 *   item from the run is judged under its reply's own key, so its sample 1 is
 *   also its reading.
 */

const STAGE: Stage = "recorded-result";
const CALIBRATION_SAMPLES = 2;
const PLAYTHROUGHS_2 = "playthroughs-2";

const luna = (effort: "low" | "medium", variant: "adopted" | "recordedResult") => armKey({ model: "gpt-6-luna", reasoningEffort: effort }, variant);

/** The stage's arms: production's turn and the variant, on the single-player and the group turn model. */
export const RECORDED_ARMS = [luna("medium", "adopted"), luna("medium", "recordedResult"), luna("low", "adopted"), luna("low", "recordedResult")];

const STAGE_CASES = new Set<string>([...RECORDED_RESULT_CASES.single, ...RECORDED_RESULT_CASES.groups]);

type Lookup = { records: CallRecord[]; cases: EvalCase[]; load: (record: CallRecord) => unknown };

/** A stored reply of the stage's arms as the game keeps it: its turn's story and the repaired reply. */
function keptReply(record: CallRecord, { cases, load }: Pick<Lookup, "cases" | "load">) {
  const evalCase = cases.find((c) => c.id === record.caseId);
  if (!evalCase?.state || record.role !== "beat" || !usable(record)) return undefined;
  const parsed = load(record) as SetOfBeatGenerationSchema | undefined;
  if (!parsed) return undefined;
  const story = caseStory(evalCase);
  return { story, reply: repairBeatReply(story, parsed).reply };
}

export type RecordedCalibrationTarget = RecordedTarget & { itemId: string };

/** The hand-read items' judge requests, each at two samples (a stored turn replayed, a run reply under its own key), and what could not be built. */
export function recordedCalibrationTargets(runs: PlayRun[], lookup: Lookup, items: RecordedCalibrationItem[] = RECORDED_CALIBRATION): { targets: RecordedCalibrationTarget[]; problems: string[] } {
  const problems: string[] = [];
  const targets: RecordedCalibrationTarget[] = [];
  for (const item of items) {
    try {
      if ("story" in item) {
        const { before, played } = replayedTurn(runs, item.story, item.turn);
        const reply = played.reply ? withEdits(played.reply as SetOfBeatGenerationSchema, item.edits ?? []) : undefined;
        const target = reply ? recordedJudgeRequests(before, reply).find((r) => r.slot === item.slot) : undefined;
        if (!target) throw new Error(`turn ${item.turn} of ${item.story} narrates no recorded exploration result for ${item.slot}`);
        targets.push({ itemId: item.id, key: `cal-${item.id}`, request: target.request, samples: CALIBRATION_SAMPLES });
      } else {
        const record = lookup.records.find((r) => r.final && r.outputFile && outputIdOf(r.outputFile) === item.output);
        const kept = record ? keptReply(record, lookup) : undefined;
        const target = kept ? recordedJudgeRequests(kept.story, kept.reply).find((r) => r.slot === item.slot) : undefined;
        if (!target) throw new Error(`no stored reply ${item.output} that narrates a recorded exploration result for ${item.slot}`);
        targets.push({ itemId: item.id, key: `${item.output}-${item.slot}`, request: target.request, samples: CALIBRATION_SAMPLES });
      }
    } catch (error) {
      problems.push(`${item.id}: ${(error as Error).message}`);
    }
  }
  return { targets, problems };
}

/** One reply of the stage's arms, with its judge calls: one per player of an exploration thread whose recorded result the turn narrates. */
export type RecordedReply = { armKey: string; caseId: string; sample: number; outputId: string; slots: string[]; targets: RecordedTarget[] };

/** Every final usable reply of the stage's arms under its tag on its cases, with the judge calls that read it. */
export function recordedRepliesToJudge(lookup: Lookup, armKeys: string[] = RECORDED_ARMS, promptState = RECORDED_RESULT_PROMPT_STATE): RecordedReply[] {
  return lookup.records.flatMap((r): RecordedReply[] => {
    if (r.group !== "beat" || !r.final || !r.outputFile || r.promptState !== promptState || !armKeys.includes(r.armKey) || !STAGE_CASES.has(r.caseId)) return [];
    const kept = keptReply(r, lookup);
    if (!kept) return [];
    const outputId = outputIdOf(r.outputFile);
    const requests = recordedJudgeRequests(kept.story, kept.reply);
    if (requests.length === 0) return [];
    return [{ armKey: r.armKey, caseId: r.caseId, sample: r.sample, outputId, slots: requests.map((q) => q.slot), targets: requests.map((q) => ({ key: `${outputId}-${q.slot}`, request: q.request, samples: 1 })) }];
  });
}

/** Every target once, at the most samples any reading asks of it. */
function mergedTargets(targets: RecordedTarget[]): RecordedTarget[] {
  const byKey = new Map<string, RecordedTarget>();
  for (const t of targets) {
    const known = byKey.get(t.key);
    if (!known || known.samples < t.samples) byKey.set(t.key, { ...t, samples: Math.max(t.samples, known?.samples ?? 0) });
  }
  return [...byKey.values()];
}

/** The judge calls a run sends: every target, or with --cases (a smoke) the calibration items and replies named, by item id or case id. */
export function recordedTargetsToSend(calibration: RecordedCalibrationTarget[], replies: RecordedReply[], caseIds: string[] | undefined): RecordedTarget[] {
  const items = caseIds ? calibration.filter((t) => caseIds.includes(t.itemId)) : calibration;
  const read = caseIds ? replies.filter((r) => caseIds.includes(r.caseId)) : replies;
  return mergedTargets([...items, ...read.flatMap((r) => r.targets)]);
}

/** A reply's verdict as a judged plan the stage readings take (every judged player passes); undefined while any of its calls is unanswered. */
export function recordedReplyAsPlan(reply: RecordedReply, answerOf: (key: string) => boolean | undefined): JudgedPlan | undefined {
  const passes = replyVerdict(reply.targets.map((t) => answerOf(t.key)));
  return passes === undefined ? undefined : { armKey: reply.armKey, caseId: reply.caseId, sample: reply.sample, outputId: reply.outputId, passes, threads: reply.targets.length };
}

/** Every player count together: an arm read as its variant alone, so the single-player and group turn models pool. */
const POOLED = "every turn model";
export const recordedPooledKey = (key: string) => `${POOLED}/${key.split("/").pop() ?? key}`;

/** A candidate's references: its own and its second ones; the pooled variant against pooled production. */
export function recordedReferencesOf(key: string): string[] {
  if (key.startsWith(`${POOLED}/`)) return key === recordedPooledKey(RECORDED_ARMS[1]) ? [recordedPooledKey(RECORDED_ARMS[0])] : [];
  return [referenceKeyOf(key), ...secondReferenceKeys(key)].filter((k): k is string => typeof k === "string");
}

/** The readings on each arm, and on every player count pooled. */
export function recordedReadings(verdicts: JudgedPlan[]) {
  return stageReadings([...verdicts, ...verdicts.map((v) => ({ ...v, armKey: recordedPooledKey(v.armKey) }))], recordedReferencesOf);
}

const runsOf = (ctx: Pick<PrepContext, "files">): PlayRun[] => playthroughRunsFrom(ctx.files.readPlaythroughs(PLAYTHROUGHS_2));

/** The prompt hash each stored playthrough call sent, by its output file. */
const promptHashesOf = (ctx: Pick<PrepContext, "files">) => {
  const byId = new Map(ctx.files.readPrepRecords().flatMap((r) => (r.outputFile && r.promptHash ? [[outputIdOf(r.outputFile), r.promptHash] as [string, string]] : [])));
  return (outputFile: string) => byId.get(outputIdOf(outputFile));
};

// --- --build-recorded-cases ---

export function buildRecordedCasesMode(ctx: Pick<PrepContext, "files" | "log">, replace: boolean): void {
  const { files, log } = ctx;
  if (!files.casesExist()) throw new Error("No frozen cases. Run --build-cases first.");
  const runs = runsOf(ctx);
  if (runs.length === 0) throw new Error("No stored second-round playthroughs (playthroughs-2.json). Run --playthroughs --round 2 first.");
  const { cases, problems, skipped } = recordedResultCasesToFreeze(files.readCases(), runs, promptHashesOf(ctx), replace);
  if (problems.length) throw new Error(problems.join("; "));
  if (skipped.length) log(`Already frozen, left as they are: ${skipped.join(", ")}.`);
  if (cases.length === 0) return log("Nothing new to freeze; no calls.");
  files.addCases(cases, undefined, replace);
  log(`Froze ${cases.map((c) => c.id).join(", ")} beside the other cases; no calls.`);
}

// --- --judge-recorded ---

export async function judgeRecordedMode(ctx: PrepContext, options: { caseIds?: string[] } = {}): Promise<void> {
  const { files, log } = ctx;
  const runs = runsOf(ctx);
  const lookup = { records: files.readRecords(), cases: files.readCases(), load: files.loadOutput };
  const { targets: calibration, problems } = recordedCalibrationTargets(runs, lookup);
  const replies = recordedRepliesToJudge(lookup);
  const targets = recordedTargetsToSend(calibration, replies, options.caseIds);
  const arm = JUDGE_ARMS[0];
  const jobs = recordedJudgeJobs(targets, arm, RECORDED_RESULT_PROMPT_STATE, STAGE);
  const done = finishedJobKeys(files.readPrepRecords());
  const open = jobs.filter((j) => !done.has(keyOf(j)));
  const estimate = open.reduce((sum, j) => sum + jobEstimateUsd(j), 0);
  ctx.refuse(STAGE, estimate);
  log(`${calibration.length} calibration items, ${replies.length} replies of the stage's arms on ${arm.key} (stage ${STAGE}): ${jobs.length} calls, ${open.length} open, est $${estimate.toFixed(3)}`);
  const result = await runJobs(jobs, ctx.deps("prep"), { caps: ctx.caps, previous: files.readPrepRecords(), extraSpend: spendBeside(files, "prep"), tokensPerMinute: ctx.tpm, maxInFlight: ctx.maxInFlight });
  if (result.stoppedReason) log(`Stopped: ${result.stoppedReason}`);
  writeJudgedRecorded(ctx, calibration, replies, problems);
}

/** judged-recorded.md and .json from every judge call so far; no calls. */
export function writeJudgedRecorded(ctx: Pick<PrepContext, "files" | "log">, calibration: RecordedCalibrationTarget[], replies: RecordedReply[], problems: string[]): void {
  const { files, log } = ctx;
  const prep = files.readPrepRecords();
  const arm = JUDGE_ARMS[0];
  const parsedAt = (key: string, sample: number) => {
    const record = finishedPrepRecord(prep, jobKey(recordedJudgeCaseId(key), prepArmKey("judge", arm), RECORDED_RESULT_PROMPT_STATE, sample));
    return record ? files.loadOutput(record) : undefined;
  };
  const judged = calibration.map((t) => {
    const parsed = [1, 2].map((sample) => parsedAt(t.key, sample));
    return { itemId: t.itemId, samples: parsed.map(recordedVerdictFrom), evidence: parsed.map(recordedEvidenceFrom) };
  });
  const verdicts = replies.flatMap((r) => [recordedReplyAsPlan(r, (key) => recordedVerdictFrom(parsedAt(key, 1)))].filter((v): v is JudgedPlan => v !== undefined));
  const failures: RecordedFailure[] = replies.flatMap((r) =>
    r.targets.flatMap((t, i) => {
      const parsed = parsedAt(t.key, 1);
      if (recordedVerdictFrom(parsed) !== false) return [];
      const said = recordedEvidenceFrom(parsed);
      return [{ armKey: r.armKey, caseId: r.caseId, sample: r.sample, outputId: r.outputId, slot: r.slots[i], evidence: `${said.evidence ?? ""} [${said.lines.join("; ")}]` }];
    })
  );
  const calibrationReading = scoreRecordedCalibration(RECORDED_CALIBRATION, judged);
  const report = { calibration: calibrationReading, items: RECORDED_CALIBRATION, judged, readings: recordedReadings(verdicts), failures };
  const spentUsd = prep.filter((r) => r.stage === STAGE).reduce((sum, r) => sum + r.costUsd, 0);
  const generatedAt = new Date();
  files.writeJudgedRecorded(renderRecordedJudge({ report, spentUsd, generatedAt, problems }), {
    generatedAt: generatedAt.toISOString(),
    promptState: RECORDED_RESULT_PROMPT_STATE,
    promptVersion: RECORDED_JUDGE_PROMPT_VERSION,
    report,
    verdicts,
    problems,
    spentUsd,
  });
  const c = calibrationReading;
  log(`recordedResultTold: ${c.agree} of ${c.decided} agree (hand yes ${c.handPasses}, no ${c.handFails}), samples ${c.pairsAgree} of ${c.pairs}: ${c.reliable ? "reliable" : "not reliable"}`);
  for (const r of report.readings) log(`  ${r.armKey}: ${r.plans.hits} of ${r.plans.n} pass${r.vsReference && r.referenceKey ? `; against ${r.referenceKey} ${r.vsReference.arm.hits}/${r.vsReference.arm.n} vs ${r.vsReference.reference.hits}/${r.vsReference.reference.n}${r.vsReference.moved ? `, moved ${r.vsReference.moved}` : r.vsReference.beyondNoise ? ", beyond the noise, not moved" : ""}` : ""}`);
  log(`The stage's judge calls so far $${spentUsd.toFixed(4)}. Wrote judged-recorded.md and .json.`);
}
