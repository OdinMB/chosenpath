import type { PlayerSlot, SetOfBeatGenerationSchema } from "core/types/index.js";
import { repairBeatReply } from "../../game/services/beatRepairs.js";
import { armKey, OUTCOME_SETTLED_CASES, OUTCOME_SETTLED_PROMPT_STATE, secondReferenceKeys, type Stage } from "./arms.js";
import { caseStory, type EvalCase } from "./cases.js";
import { endingEvidenceFrom, endingJudgeCaseId, endingJudgeJobs, endingJudgeRequest, endingVerdictFrom, replyVerdict as endingReplyVerdict } from "./endingJudge.js";
import { jobEstimateUsd } from "./jobPlan.js";
import { JUDGE_ARMS, outputIdOf } from "./judgedChecks.js";
import { outcomeSettledCasesToFreeze } from "./outcomeSettledCases.js";
import {
  SETTLED_CALIBRATION,
  SETTLED_JUDGE_PROMPT_VERSION,
  renderSettledJudge,
  scoreSettledCalibration,
  settledEvidenceFrom,
  settledJudgeCaseId,
  settledJudgeJobs,
  settledJudgeRequest,
  settledVerdictFrom,
  type SettledCalibrationItem,
  type SettledCheckReport,
  type SettledFailure,
  type SettledTarget,
} from "./outcomeSettledJudge.js";
import { playthroughRunsFrom } from "./playthroughMode.js";
import { replayedTurn } from "./playthroughReplay.js";
import type { PlayRun } from "./playthroughs.js";
import { finishedPrepRecord, prepArmKey } from "./prepCalls.js";
import { finishedJobKeys, jobKey, keyOf, runJobs, usable, type CallRecord } from "./runner.js";
import { stageReadings, type JudgedPlan } from "./stageJudge.js";
import { spendBeside, type PrepContext } from "./turnPrep.js";
import { referenceKeyOf } from "./variantComparison.js";

/*
 * The outcome-settled stage's CLI modes (2026-09-30, the second
 * playthroughs' review), kept out of run.ts:
 * - --build-settled-cases: the stage's cases from the second round's stored
 *   runs (outcomeSettledCases.ts), each only where its request is the one
 *   production sent there, frozen beside the others (those already frozen
 *   left as they are, unless --rebuild-cases); no calls;
 * - --judge-settled: the stage's judged checks, into prep-calls.jsonl, booked
 *   to the stage, then judged-settled.md and .json: completedToldSettled
 *   (outcomeSettledJudge.ts) on its calibration (two samples) and on every
 *   switch turn of the stage's arms under adopted8 (one sample), and the
 *   ending's calibrated outcomesToldAsLeft (endingJudge.ts, its calibration
 *   read in the ending-state stage) on every ending of the arms, one call per
 *   player. A reply is read as the game keeps it (the beat repairs); a
 *   calibration item from the run is judged under its reply's own key, so its
 *   sample 1 is also its reading.
 */

const STAGE: Stage = "outcome-settled";
const CALIBRATION_SAMPLES = 2;
const PLAYTHROUGHS_2 = "playthroughs-2";

const luna = (effort: "low" | "medium", variant: "adopted" | "outcomeSettled" | "outcomeSettledB") => armKey({ model: "gpt-6-luna", reasoningEffort: effort }, variant);

/** The stage's arms: production's turn and the variant, on the single-player and the group turn model, then the variant's fix-and-retest. */
export const SETTLED_ARMS = [
  luna("medium", "adopted"),
  luna("medium", "outcomeSettled"),
  luna("low", "adopted"),
  luna("low", "outcomeSettled"),
  luna("medium", "outcomeSettledB"),
  luna("low", "outcomeSettledB"),
];

const STAGE_CASES = new Set<string>([...OUTCOME_SETTLED_CASES.single, ...OUTCOME_SETTLED_CASES.groups]);

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

export type SettledCalibrationTarget = SettledTarget & { itemId: string };

/**
 * A constructed version of a reply: each passage (which must occur in the
 * reply) replaced wherever it occurs. A passage is read as text inside the
 * reply's strings, else as the reply's JSON itself (a stat change's fields).
 */
export function withEdits(reply: SetOfBeatGenerationSchema, edits: [string, string][]): SetOfBeatGenerationSchema {
  let text = JSON.stringify(reply);
  const inString = (s: string) => JSON.stringify(s).slice(1, -1);
  for (const [from, to] of edits) {
    const [written, replacement] = text.includes(inString(from)) ? [inString(from), inString(to)] : [from, to];
    if (!text.includes(written)) throw new Error(`the edit's passage "${from.slice(0, 60)}" is not in the reply`);
    text = text.split(written).join(replacement);
  }
  return JSON.parse(text) as SetOfBeatGenerationSchema;
}

/** The hand-read items' judge requests, each at two samples (a stored turn replayed, a run reply under its own key), and what could not be built. */
export function settledCalibrationTargets(runs: PlayRun[], lookup: Lookup, items: SettledCalibrationItem[] = SETTLED_CALIBRATION): { targets: SettledCalibrationTarget[]; problems: string[] } {
  const problems: string[] = [];
  const targets: SettledCalibrationTarget[] = [];
  for (const item of items) {
    try {
      if ("story" in item) {
        const { before, played } = replayedTurn(runs, item.story, item.turn);
        const reply = played.reply ? withEdits(played.reply as SetOfBeatGenerationSchema, item.edits ?? []) : undefined;
        const request = reply ? settledJudgeRequest(before, reply) : undefined;
        if (!request) throw new Error(`turn ${item.turn} of ${item.story} completes no outcome`);
        targets.push({ itemId: item.id, key: `cal-${item.id}`, request, samples: CALIBRATION_SAMPLES });
      } else {
        const record = lookup.records.find((r) => r.final && r.outputFile && outputIdOf(r.outputFile) === item.output);
        const kept = record ? keptReply(record, lookup) : undefined;
        const request = kept ? settledJudgeRequest(kept.story, kept.reply) : undefined;
        if (!request) throw new Error(`no stored reply ${item.output} that completes an outcome`);
        targets.push({ itemId: item.id, key: item.output, request, samples: CALIBRATION_SAMPLES });
      }
    } catch (error) {
      problems.push(`${item.id}: ${(error as Error).message}`);
    }
  }
  return { targets, problems };
}

/** One reply of the stage's arms, with its judge calls: one on a switch turn, one per player on an ending. */
export type SettledReply = { armKey: string; caseId: string; sample: number; outputId: string; kind: "switch" | "ending"; slots: PlayerSlot[]; targets: SettledTarget[] };

/** Every final usable reply of the stage's arms under its tag on its cases, with the judge calls that read it. */
export function settledRepliesToJudge(lookup: Lookup, armKeys: string[] = SETTLED_ARMS, promptState = OUTCOME_SETTLED_PROMPT_STATE): SettledReply[] {
  return lookup.records.flatMap((r): SettledReply[] => {
    if (r.group !== "beat" || !r.final || !r.outputFile || r.promptState !== promptState || !armKeys.includes(r.armKey) || !STAGE_CASES.has(r.caseId)) return [];
    const kept = keptReply(r, lookup);
    if (!kept) return [];
    const outputId = outputIdOf(r.outputFile);
    const base = { armKey: r.armKey, caseId: r.caseId, sample: r.sample, outputId };
    if (kept.story.getCurrentBeatType() === "ending") {
      const slots = kept.story.getPlayerSlots() as PlayerSlot[];
      const targets = slots.flatMap((slot) => {
        const request = endingJudgeRequest(kept.story, kept.reply, slot);
        return request ? [{ key: `${outputId}-${slot}`, request, samples: 1 }] : [];
      });
      return targets.length ? [{ ...base, kind: "ending", slots, targets }] : [];
    }
    const request = settledJudgeRequest(kept.story, kept.reply);
    return request ? [{ ...base, kind: "switch", slots: [], targets: [{ key: outputId, request, samples: 1 }] }] : [];
  });
}

/** Every target once, at the most samples any reading asks of it. */
function mergedTargets(targets: SettledTarget[]): SettledTarget[] {
  const byKey = new Map<string, SettledTarget>();
  for (const t of targets) {
    const known = byKey.get(t.key);
    if (!known || known.samples < t.samples) byKey.set(t.key, { ...t, samples: Math.max(t.samples, known?.samples ?? 0) });
  }
  return [...byKey.values()];
}

/** The judge calls a run sends: every target, or with --cases (a smoke) the calibration items and replies named, by item id or case id. */
export function settledTargetsToSend(calibration: SettledCalibrationTarget[], replies: SettledReply[], caseIds: string[] | undefined): { settled: SettledTarget[]; endings: SettledTarget[] } {
  const items = caseIds ? calibration.filter((t) => caseIds.includes(t.itemId)) : calibration;
  const read = caseIds ? replies.filter((r) => caseIds.includes(r.caseId)) : replies;
  return {
    settled: mergedTargets([...items, ...read.filter((r) => r.kind === "switch").flatMap((r) => r.targets)]),
    endings: mergedTargets(read.filter((r) => r.kind === "ending").flatMap((r) => r.targets)),
  };
}

/** A reply's verdict as a judged plan the stage readings take; undefined while any of its calls is unanswered. */
export function settledReplyAsPlan(reply: SettledReply, answerOf: (key: string) => boolean | undefined): JudgedPlan | undefined {
  const passes = endingReplyVerdict(reply.targets.map((t) => answerOf(t.key)));
  return passes === undefined ? undefined : { armKey: reply.armKey, caseId: reply.caseId, sample: reply.sample, outputId: reply.outputId, passes, threads: reply.targets.length };
}

/** Every player count together: an arm read as its variant alone, so the single-player and group turn models pool. */
const POOLED = "every turn model";
export const pooledKey = (key: string) => `${POOLED}/${key.split("/").pop() ?? key}`;

/** A candidate's references: its own and its second ones; the pooled variants against pooled production (the retest against the run's lines too). */
export function settledReferencesOf(key: string): string[] {
  if (key.startsWith(`${POOLED}/`)) {
    if (key === pooledKey(SETTLED_ARMS[1])) return [pooledKey(SETTLED_ARMS[0])];
    if (key === pooledKey(SETTLED_ARMS[4])) return [pooledKey(SETTLED_ARMS[0]), pooledKey(SETTLED_ARMS[1])];
    return [];
  }
  return [referenceKeyOf(key), ...secondReferenceKeys(key)].filter((k): k is string => typeof k === "string");
}

/** The readings on each arm, and on every player count pooled. */
export function settledReadings(verdicts: JudgedPlan[]) {
  return stageReadings([...verdicts, ...verdicts.map((v) => ({ ...v, armKey: pooledKey(v.armKey) }))], settledReferencesOf);
}

const runsOf = (ctx: Pick<PrepContext, "files">): PlayRun[] => playthroughRunsFrom(ctx.files.readPlaythroughs(PLAYTHROUGHS_2));

/** The prompt hash each stored playthrough call sent, by its output file. */
const promptHashesOf = (ctx: Pick<PrepContext, "files">) => {
  const byId = new Map(ctx.files.readPrepRecords().flatMap((r) => (r.outputFile && r.promptHash ? [[outputIdOf(r.outputFile), r.promptHash] as [string, string]] : [])));
  return (outputFile: string) => byId.get(outputIdOf(outputFile));
};

// --- --build-settled-cases ---

export function buildSettledCasesMode(ctx: Pick<PrepContext, "files" | "log">, replace: boolean): void {
  const { files, log } = ctx;
  if (!files.casesExist()) throw new Error("No frozen cases. Run --build-cases first.");
  const runs = runsOf(ctx);
  if (runs.length === 0) throw new Error("No stored second-round playthroughs (playthroughs-2.json). Run --playthroughs --round 2 first.");
  const { cases, problems, skipped } = outcomeSettledCasesToFreeze(files.readCases(), runs, promptHashesOf(ctx), replace);
  if (problems.length) throw new Error(problems.join("; "));
  if (skipped.length) log(`Already frozen, left as they are: ${skipped.join(", ")}.`);
  if (cases.length === 0) return log("Nothing new to freeze; no calls.");
  files.addCases(cases, undefined, replace);
  log(`Froze ${cases.map((c) => c.id).join(", ")} beside the other cases; no calls.`);
}

// --- --judge-settled ---

export async function judgeSettledMode(ctx: PrepContext, options: { caseIds?: string[] } = {}): Promise<void> {
  const { files, log } = ctx;
  const runs = runsOf(ctx);
  const lookup = { records: files.readRecords(), cases: files.readCases(), load: files.loadOutput };
  const { targets: calibration, problems } = settledCalibrationTargets(runs, lookup);
  const replies = settledRepliesToJudge(lookup);
  const { settled, endings } = settledTargetsToSend(calibration, replies, options.caseIds);
  const arm = JUDGE_ARMS[0];
  const jobs = [...settledJudgeJobs(settled, arm, OUTCOME_SETTLED_PROMPT_STATE, STAGE), ...endingJudgeJobs(endings, arm, OUTCOME_SETTLED_PROMPT_STATE, STAGE)];
  const done = finishedJobKeys(files.readPrepRecords());
  const open = jobs.filter((j) => !done.has(keyOf(j)));
  const estimate = open.reduce((sum, j) => sum + jobEstimateUsd(j), 0);
  ctx.refuse(STAGE, estimate);
  log(`${calibration.length} calibration items, ${replies.length} replies of the stage's arms on ${arm.key} (stage ${STAGE}): ${jobs.length} calls, ${open.length} open, est $${estimate.toFixed(3)}`);
  const result = await runJobs(jobs, ctx.deps("prep"), { caps: ctx.caps, previous: files.readPrepRecords(), extraSpend: spendBeside(files, "prep"), tokensPerMinute: ctx.tpm, maxInFlight: ctx.maxInFlight });
  if (result.stoppedReason) log(`Stopped: ${result.stoppedReason}`);
  writeJudgedSettled(ctx, calibration, replies, problems);
}

/** judged-settled.md and .json from every judge call so far; no calls. */
export function writeJudgedSettled(ctx: Pick<PrepContext, "files" | "log">, calibration: SettledCalibrationTarget[], replies: SettledReply[], problems: string[]): void {
  const { files, log } = ctx;
  const prep = files.readPrepRecords();
  const arm = JUDGE_ARMS[0];
  const parsedAt = (caseId: string, sample: number) => {
    const record = finishedPrepRecord(prep, jobKey(caseId, prepArmKey("judge", arm), OUTCOME_SETTLED_PROMPT_STATE, sample));
    return record ? files.loadOutput(record) : undefined;
  };
  const settledAt = (key: string, sample: number) => parsedAt(settledJudgeCaseId(key), sample);
  const endingAt = (key: string, sample: number) => parsedAt(endingJudgeCaseId(key), sample);

  const judged = calibration.map((t) => {
    const parsed = [1, 2].map((sample) => settledAt(t.key, sample));
    return { itemId: t.itemId, samples: parsed.map(settledVerdictFrom), evidence: parsed.map(settledEvidenceFrom) };
  });
  const switches = replies.filter((r) => r.kind === "switch");
  const endingReplies = replies.filter((r) => r.kind === "ending");
  const verdictsOf = (list: SettledReply[], answerOf: (key: string) => boolean | undefined) => list.flatMap((r) => [settledReplyAsPlan(r, answerOf)].filter((v): v is JudgedPlan => v !== undefined));
  const settledVerdicts = verdictsOf(switches, (key) => settledVerdictFrom(settledAt(key, 1)));
  const endingVerdicts = verdictsOf(endingReplies, (key) => endingVerdictFrom(endingAt(key, 1)));
  const settledFailures: SettledFailure[] = switches.flatMap((r) => {
    const parsed = settledAt(r.targets[0].key, 1);
    if (settledVerdictFrom(parsed) !== false) return [];
    const said = settledEvidenceFrom(parsed);
    return [{ check: "completedToldSettled", armKey: r.armKey, caseId: r.caseId, sample: r.sample, outputId: r.outputId, evidence: `${said.evidence ?? ""} [${said.lines.join("; ")}]` }];
  });
  const endingFailures: SettledFailure[] = endingReplies.flatMap((r) =>
    r.targets.flatMap((t, i) => {
      const parsed = endingAt(t.key, 1);
      if (endingVerdictFrom(parsed) !== false) return [];
      const said = endingEvidenceFrom(parsed);
      return [{ check: "outcomesToldAsLeft", armKey: r.armKey, caseId: r.caseId, sample: r.sample, outputId: r.outputId, slot: r.slots[i], evidence: `${said.evidence ?? ""} [${said.outcomes.join("; ")}]` }];
    })
  );
  const checks: SettledCheckReport[] = [
    {
      title: "completedToldSettled: the switch turn that completes an outcome",
      how: "one Luna low call per switch turn that completes an outcome (every player's text in one call) asks whether every player's text and every fact the turn records tell each completed outcome as settled, as its milestones leave it, and whether any stat change contradicts a milestone the turn adds; the judge reads the completed outcomes, the other milestones, the stat changes with each stat's levels and value before, the facts and the texts, never the prompt.",
      calibration: scoreSettledCalibration(SETTLED_CALIBRATION, judged),
      items: SETTLED_CALIBRATION,
      judged,
      readings: settledReadings(settledVerdicts),
      failures: settledFailures,
    },
    {
      title: "outcomesToldAsLeft: the ending",
      how: "the ending's judged check (endingJudge.ts, prompt v1), one Luna low call per player's ending; a reply passes when every player's ending passes.",
      calibrationNote: "Its calibration was read in the ending-state stage (2026-09-30): 12 of 14 agree (hand yes 6 of 7, no 6 of 7), samples 14 of 15, reliable; not sent again here.",
      readings: settledReadings(endingVerdicts),
      failures: endingFailures,
    },
  ];
  const spentUsd = prep.filter((r) => r.stage === STAGE).reduce((sum, r) => sum + r.costUsd, 0);
  const generatedAt = new Date();
  files.writeJudgedSettled(renderSettledJudge({ checks, spentUsd, generatedAt, problems }), {
    generatedAt: generatedAt.toISOString(),
    promptState: OUTCOME_SETTLED_PROMPT_STATE,
    promptVersion: SETTLED_JUDGE_PROMPT_VERSION,
    checks,
    settledVerdicts,
    endingVerdicts,
    problems,
    spentUsd,
  });
  const c = checks[0].calibration;
  if (c) log(`completedToldSettled: ${c.agree} of ${c.decided} agree (hand yes ${c.handPasses}, no ${c.handFails}), samples ${c.pairsAgree} of ${c.pairs}: ${c.reliable ? "reliable" : "not reliable"}`);
  for (const check of checks) {
    for (const r of check.readings) log(`  ${check.title.split(":")[0]} ${r.armKey}: ${r.plans.hits} of ${r.plans.n} pass${r.vsReference && r.referenceKey ? `; against ${r.referenceKey} ${r.vsReference.arm.hits}/${r.vsReference.arm.n} vs ${r.vsReference.reference.hits}/${r.vsReference.reference.n}${r.vsReference.moved ? `, moved ${r.vsReference.moved}` : r.vsReference.beyondNoise ? ", beyond the noise, not moved" : ""}` : ""}`);
  }
  log(`The stage's judge calls so far $${spentUsd.toFixed(4)}. Wrote judged-settled.md and .json.`);
}
