import type { PlayerSlot, SetOfBeatGenerationSchema } from "core/types/index.js";
import { repairBeatReply } from "../../game/services/beatRepairs.js";
import type { TextRequest } from "../../game/services/storyTextSteps.js";
import { secondReferenceKeys, type Stage } from "./arms.js";
import type { LedgerStage } from "./budget.js";
import { caseStory, type EvalCase } from "./cases.js";
import { endingCasesToFreeze } from "./endingCases.js";
import {
  ENDING_JUDGE_CALIBRATION,
  ENDING_JUDGE_PROMPT_VERSION,
  endingEvidenceFrom,
  endingJudgeCaseId,
  endingJudgeJobs,
  endingJudgeRequest,
  endingVerdictFrom,
  renderEndingJudge,
  replyVerdict,
  scoreEndingCalibration,
  type EndingCalibrationItem,
  type EndingFailure,
} from "./endingJudge.js";
import { jobEstimateUsd } from "./jobPlan.js";
import { JUDGE_ARMS, outputIdOf } from "./judgedChecks.js";
import { finishedPrepRecord, prepArmKey } from "./prepCalls.js";
import { finishedJobKeys, jobKey, keyOf, runJobs, usable, type CallRecord } from "./runner.js";
import type { ChainRun } from "./setupChain.js";
import { stageReadings, type JudgedPlan } from "./stageJudge.js";
import { spendBeside, type PrepContext } from "./turnPrep.js";
import { referenceKeyOf } from "./variantComparison.js";

/*
 * The ending's CLI modes (the owner's decision of 2026-09-30 that each outcome
 * is told as its milestones leave it), kept out of run.ts:
 * - --build-ending-cases: the four built endings (endingCases.ts) from the
 *   frozen cases and the stored setup chain, frozen beside the others (those
 *   already frozen left as they are, unless --rebuild-cases); no calls;
 * - --judge-endings: the judged check (endingJudge.ts) on its calibration
 *   (two samples each) and every final usable ending of the arms given (one
 *   sample each), one call per player's ending, into prep-calls.jsonl, then
 *   judged-endings.md and .json. An ending is read as the game keeps it (the
 *   beat repairs), and one judge call serves a player's ending wherever it is
 *   read: the calibration's sample 1 is also its reading.
 */

/** What a judge call reads, and how many samples it gets. */
export type EndingTarget = { key: string; request: TextRequest; samples: number };

/** One reply of the arms, with a judge call per player's ending. */
export type ReplyToJudge = { armKey: string; caseId: string; sample: number; outputId: string; slots: PlayerSlot[]; targets: EndingTarget[] };

type Lookup = { records: CallRecord[]; cases: EvalCase[]; load: (record: CallRecord) => unknown };

const targetKey = (outputId: string, slot: PlayerSlot) => `${outputId}-${slot}`;

/** A stored ending as the game keeps it: the case's story (the ending's input) and the repaired reply. */
function storedEnding(record: CallRecord, { cases, load }: Pick<Lookup, "cases" | "load">) {
  const evalCase = cases.find((c) => c.id === record.caseId);
  if (!evalCase?.state || record.role !== "beat" || !usable(record)) return undefined;
  const story = caseStory(evalCase);
  if (story.getCurrentBeatType() !== "ending") return undefined;
  const parsed = load(record) as SetOfBeatGenerationSchema | undefined;
  if (!parsed) return undefined;
  return { story, reply: repairBeatReply(story, parsed).reply };
}

/** The calibration items' judge requests, each at two samples, and what could not be built. */
export function endingCalibrationTargets(items: EndingCalibrationItem[], lookup: Lookup): { targets: (EndingTarget & { itemId: string })[]; problems: string[] } {
  const problems: string[] = [];
  const targets = items.flatMap((item) => {
    const record = lookup.records.find((r) => r.outputFile && outputIdOf(r.outputFile) === item.output && r.final);
    const ending = record ? storedEnding(record, lookup) : undefined;
    const request = ending ? endingJudgeRequest(ending.story, ending.reply, item.slot) : undefined;
    if (!request) {
      problems.push(`${item.id}: no stored ending ${item.output} for ${item.slot}`);
      return [];
    }
    return [{ itemId: item.id, key: targetKey(item.output, item.slot), request, samples: 2 }];
  });
  return { targets, problems };
}

/** Every final usable ending of the arms in the prompt state, one judge call per player. */
export function endingsToJudge(armKeys: string[], promptState: string, lookup: Lookup): ReplyToJudge[] {
  return lookup.records.flatMap((r): ReplyToJudge[] => {
    if (r.group !== "beat" || !r.final || !r.outputFile || r.promptState !== promptState || !armKeys.includes(r.armKey)) return [];
    const ending = storedEnding(r, lookup);
    if (!ending) return [];
    const outputId = outputIdOf(r.outputFile);
    const slots = ending.story.getPlayerSlots() as PlayerSlot[];
    const targets = slots.flatMap((slot) => {
      const request = endingJudgeRequest(ending.story, ending.reply, slot);
      return request ? [{ key: targetKey(outputId, slot), request, samples: 1 }] : [];
    });
    return targets.length ? [{ armKey: r.armKey, caseId: r.caseId, sample: r.sample, outputId, slots, targets }] : [];
  });
}

/** Every target once, at the most samples any reading asks of it. */
function mergedTargets(targets: EndingTarget[]): EndingTarget[] {
  const byKey = new Map<string, EndingTarget>();
  for (const t of targets) {
    const known = byKey.get(t.key);
    if (!known || known.samples < t.samples) byKey.set(t.key, { ...t, samples: Math.max(t.samples, known?.samples ?? 0) });
  }
  return [...byKey.values()];
}

/** The judge calls a run sends: every target, or with --cases (a smoke) the calibration items and replies named, by item id or case id. */
export function smokeEndingTargets(calibration: (EndingTarget & { itemId: string })[], replies: ReplyToJudge[], caseIds: string[] | undefined): EndingTarget[] {
  const items = caseIds ? calibration.filter((t) => caseIds.includes(t.itemId)) : calibration;
  const read = caseIds ? replies.filter((r) => caseIds.includes(r.caseId)) : replies;
  return mergedTargets([...items, ...read.flatMap((r) => r.targets)]);
}

/** A reply's verdict from its players' sample-1 answers, as a judged plan the stage readings take; undefined while any is unanswered. */
export function replyAsPlan(reply: ReplyToJudge, answerOf: (key: string) => boolean | undefined): JudgedPlan | undefined {
  const passes = replyVerdict(reply.targets.map((t) => answerOf(t.key)));
  return passes === undefined ? undefined : { armKey: reply.armKey, caseId: reply.caseId, sample: reply.sample, outputId: reply.outputId, passes, threads: reply.targets.length };
}

/** A candidate's references for the readings: its own, then its second ones. */
const referencesOf = (armKey: string) => [referenceKeyOf(armKey), ...secondReferenceKeys(armKey)].filter((k): k is string => typeof k === "string");

// --- --build-ending-cases ---

export function buildEndingCasesMode(ctx: Pick<PrepContext, "files" | "log">, replace: boolean): void {
  const { files, log } = ctx;
  if (!files.casesExist()) throw new Error("No frozen cases. Run --build-cases first.");
  const chain = files.readSetupChain() as { runs?: ChainRun[] } | undefined;
  const { cases, problems, skipped } = endingCasesToFreeze(files.readCases(), chain?.runs ?? [], replace);
  if (problems.length) throw new Error(problems.join("; "));
  if (skipped.length) log(`Already frozen, left as they are: ${skipped.join(", ")}.`);
  if (cases.length === 0) return log("Nothing new to freeze; no calls.");
  files.addCases(cases, undefined, replace);
  log(`Froze ${cases.map((c) => c.id).join(", ")} beside the other cases; no calls.`);
}

// --- --judge-endings ---

export async function judgeEndingsMode(ctx: PrepContext, armKeys: string[] | undefined, promptState: string, options: { stage?: LedgerStage; caseIds?: string[] } = {}): Promise<void> {
  const { files, log } = ctx;
  const stage = options.stage ?? "ending-state";
  const lookup = { records: files.readRecords(), cases: files.readCases(), load: files.loadOutput };
  const { targets: calibration, problems } = endingCalibrationTargets(ENDING_JUDGE_CALIBRATION, lookup);
  const replies = endingsToJudge(armKeys ?? [], promptState, lookup);
  // The file is written over everything judged so far, whatever this run sent
  const targets = smokeEndingTargets(calibration, replies, options.caseIds);
  const arm = JUDGE_ARMS[0];
  const jobs = endingJudgeJobs(targets, arm, promptState, stage as Stage);
  const done = finishedJobKeys(files.readPrepRecords());
  const open = jobs.filter((j) => !done.has(keyOf(j)));
  const estimate = open.reduce((sum, j) => sum + jobEstimateUsd(j), 0);
  ctx.refuse(stage, estimate);
  log(`${calibration.length} calibration items, ${replies.length} endings (${armKeys?.length ?? 0} arms) on ${arm.key} (stage ${stage}): ${jobs.length} calls, ${open.length} open, est $${estimate.toFixed(3)}`);
  const result = await runJobs(jobs, ctx.deps("prep"), { caps: ctx.caps, previous: files.readPrepRecords(), extraSpend: spendBeside(files, "prep"), tokensPerMinute: ctx.tpm, maxInFlight: ctx.maxInFlight });
  if (result.stoppedReason) log(`Stopped: ${result.stoppedReason}`);
  writeJudgedEndings(ctx, calibration, replies, problems, promptState);
}

function writeJudgedEndings(ctx: Pick<PrepContext, "files" | "log">, calibration: (EndingTarget & { itemId: string })[], replies: ReplyToJudge[], problems: string[], promptState: string) {
  const { files, log } = ctx;
  const prep = files.readPrepRecords();
  const arm = JUDGE_ARMS[0];
  const parsedAt = (key: string, sample: number) => {
    const record = finishedPrepRecord(prep, jobKey(endingJudgeCaseId(key), prepArmKey("judge", arm), promptState, sample));
    return record ? files.loadOutput(record) : undefined;
  };
  const judged = calibration.map((t) => {
    const parsed = [1, 2].map((sample) => parsedAt(t.key, sample));
    return { itemId: t.itemId, samples: parsed.map(endingVerdictFrom), evidence: parsed.map(endingEvidenceFrom) };
  });
  const score = scoreEndingCalibration(ENDING_JUDGE_CALIBRATION, judged);
  const verdicts = replies.flatMap((r) => {
    const verdict = replyAsPlan(r, (key) => endingVerdictFrom(parsedAt(key, 1)));
    return verdict ? [verdict] : [];
  });
  const failures: EndingFailure[] = replies.flatMap((r) =>
    r.targets.flatMap((t, i) => {
      const parsed = parsedAt(t.key, 1);
      if (endingVerdictFrom(parsed) !== false) return [];
      const said = endingEvidenceFrom(parsed);
      return [{ armKey: r.armKey, caseId: r.caseId, sample: r.sample, outputId: r.outputId, slot: r.slots[i] ?? "", evidence: `${said.evidence ?? ""} [${said.outcomes.join("; ")}]` }];
    })
  );
  const readings = stageReadings(verdicts, referencesOf);
  const spentUsd = prep.filter((r) => r.caseId.startsWith("judge-ending-")).reduce((sum, r) => sum + r.costUsd, 0);
  const generatedAt = new Date();
  files.writeJudgedEndings(renderEndingJudge({ items: ENDING_JUDGE_CALIBRATION, calibration: score, judged, readings, failures, spentUsd, generatedAt, problems }), {
    generatedAt: generatedAt.toISOString(),
    promptState,
    promptVersion: ENDING_JUDGE_PROMPT_VERSION,
    calibration: score,
    judged,
    readings,
    verdicts,
    failures,
    problems,
    spentUsd,
  });
  log(`${score.check}: ${score.agree} of ${score.decided} agree (hand yes ${score.handPasses}, no ${score.handFails}), samples ${score.pairsAgree} of ${score.pairs}: ${score.reliable ? "reliable" : "not reliable"}`);
  for (const r of readings) log(`${r.armKey}: ${r.plans.hits} of ${r.plans.n} endings pass${r.vsReference && r.referenceKey ? `; against ${r.referenceKey} ${r.vsReference.arm.hits}/${r.vsReference.arm.n} vs ${r.vsReference.reference.hits}/${r.vsReference.reference.n}${r.vsReference.moved ? `, moved ${r.vsReference.moved}` : r.vsReference.beyondNoise ? ", beyond the noise, not moved" : ""}` : ""}`);
  log(`Ending judge calls so far $${spentUsd.toFixed(4)}. Wrote judged-endings.md and .json.`);
}
