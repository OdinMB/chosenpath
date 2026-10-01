import type { SetOfBeatGenerationSchema } from "core/types/index.js";
import { repairBeatReply } from "../../game/services/beatRepairs.js";
import { armKey, MONEY_ADDS_UP_CASES, MONEY_ADDS_UP_PROMPT_STATE, secondReferenceKeys, type Stage } from "./arms.js";
import { caseStory, type EvalCase } from "./cases.js";
import { replyVerdict } from "./endingJudge.js";
import { jobEstimateUsd } from "./jobPlan.js";
import { JUDGE_ARMS, outputIdOf } from "./judgedChecks.js";
import { moneyAddsUpCasesToFreeze } from "./moneyAddsUpCases.js";
import {
  appliedChanges,
  MONEY_CALIBRATION,
  MONEY_JUDGE_PROMPT_VERSION,
  moneyEvidenceFrom,
  moneyJudgeCaseId,
  moneyJudgeJobs,
  moneyJudgeRequests,
  moneyVerdictFrom,
  renderMoneyJudge,
  scoreMoneyCalibration,
  type MoneyCalibrationItem,
  type MoneyReplyRow,
  type MoneyTarget,
} from "./moneyAddsUpJudge.js";
import { withEdits } from "./outcomeSettledPrep.js";
import { playthroughRunsFrom } from "./playthroughMode.js";
import { replayedTurn } from "./playthroughReplay.js";
import type { PlayRun } from "./playthroughs.js";
import { finishedPrepRecord, prepArmKey } from "./prepCalls.js";
import { finishedJobKeys, jobKey, keyOf, runJobs, usable, type CallRecord } from "./runner.js";
import { stageReadings, type JudgedPlan } from "./stageJudge.js";
import { spendBeside, type PrepContext } from "./turnPrep.js";
import { referenceKeyOf } from "./variantComparison.js";

/*
 * The money-adds-up stage's CLI modes (2026-10-01, fix 7 of the second
 * playthroughs' review), kept out of run.ts:
 * - --build-money-cases: the stage's cases from the second round's stored
 *   lemonade story (moneyAddsUpCases.ts), each only where its request is the
 *   one production sent there, recorded as a learning story, frozen beside the
 *   others (those already frozen left as they are, unless --rebuild-cases); no
 *   calls;
 * - --judge-money: the stage's judged check, into prep-calls.jsonl, booked to
 *   the stage, then judged-money.md and .json: figuresAddUp
 *   (moneyAddsUpJudge.ts) on its calibration (two samples) and on every reply
 *   of the stage's arms under adopted14 (one sample), one call per player. A
 *   reply is read as the game keeps it (the beat repairs); a calibration item
 *   from the run is judged under its reply's own key, so its sample 1 is also
 *   its reading. The report lists every reply with its stat changes as the
 *   game applies them.
 */

const STAGE: Stage = "money-adds-up";
const CALIBRATION_SAMPLES = 2;
const PLAYTHROUGHS_2 = "playthroughs-2";

/** The stage's arms: production's turn, the variant and its fix-and-retest on the single-player turn model. */
export const MONEY_ARMS = (["adopted", "moneyAddsUp", "moneyAddsUpB"] as const).map((variant) => armKey({ model: "gpt-6-luna", reasoningEffort: "medium" }, variant));

const STAGE_CASES = new Set<string>(MONEY_ADDS_UP_CASES);

type Lookup = { records: CallRecord[]; cases: EvalCase[]; load: (record: CallRecord) => unknown };

/** The stored playthroughs by round: the first round's (playthroughs.json) and the second's. */
export type RunsByRound = { 1: PlayRun[]; 2: PlayRun[] };

/** A stored reply as the game keeps it: its turn's story and the repaired reply. */
function keptReply(record: CallRecord, { cases, load }: Pick<Lookup, "cases" | "load">) {
  const evalCase = cases.find((c) => c.id === record.caseId);
  if (!evalCase?.state || record.role !== "beat" || !usable(record)) return undefined;
  const parsed = load(record) as SetOfBeatGenerationSchema | undefined;
  if (!parsed) return undefined;
  const story = caseStory(evalCase);
  return { story, reply: repairBeatReply(story, parsed).reply };
}

export type MoneyCalibrationTarget = MoneyTarget & { itemId: string };

/** The hand-read items' judge requests, each at two samples (a stored turn replayed from its round, a run reply under its own key), and what could not be built. */
export function moneyCalibrationTargets(runs: RunsByRound, lookup: Lookup, items: MoneyCalibrationItem[] = MONEY_CALIBRATION): { targets: MoneyCalibrationTarget[]; problems: string[] } {
  const problems: string[] = [];
  const targets: MoneyCalibrationTarget[] = [];
  for (const item of items) {
    try {
      if ("story" in item) {
        const { before, played } = replayedTurn(runs[item.round ?? 2], item.story, item.turn);
        const reply = played.reply ? withEdits(played.reply as SetOfBeatGenerationSchema, item.edits ?? []) : undefined;
        const target = reply ? moneyJudgeRequests(before, reply).find((r) => r.slot === item.slot) : undefined;
        if (!target) throw new Error(`turn ${item.turn} of ${item.story} has no text for ${item.slot} or no number or percentage stat`);
        targets.push({ itemId: item.id, key: `cal-${item.id}`, request: target.request, samples: CALIBRATION_SAMPLES });
      } else {
        const record = lookup.records.find((r) => r.final && r.outputFile && outputIdOf(r.outputFile) === item.output);
        const kept = record ? keptReply(record, lookup) : undefined;
        const target = kept ? moneyJudgeRequests(kept.story, kept.reply).find((r) => r.slot === item.slot) : undefined;
        if (!target) throw new Error(`no stored reply ${item.output} with a text for ${item.slot}`);
        targets.push({ itemId: item.id, key: `${item.output}-${item.slot}`, request: target.request, samples: CALIBRATION_SAMPLES });
      }
    } catch (error) {
      problems.push(`${item.id}: ${(error as Error).message}`);
    }
  }
  return { targets, problems };
}

/** One reply of the stage's arms, with its judge calls: one per player. */
export type MoneyReply = { armKey: string; caseId: string; sample: number; outputId: string; slots: string[]; targets: MoneyTarget[]; changes: string[] };

/** Every final usable reply of the stage's arms under its tag on its cases, with the judge calls that read it. */
export function moneyRepliesToJudge(lookup: Lookup, armKeys: string[] = MONEY_ARMS, promptState = MONEY_ADDS_UP_PROMPT_STATE): MoneyReply[] {
  return lookup.records.flatMap((r): MoneyReply[] => {
    if (r.group !== "beat" || !r.final || !r.outputFile || r.promptState !== promptState || !armKeys.includes(r.armKey) || !STAGE_CASES.has(r.caseId)) return [];
    const kept = keptReply(r, lookup);
    if (!kept) return [];
    const outputId = outputIdOf(r.outputFile);
    const requests = moneyJudgeRequests(kept.story, kept.reply);
    if (requests.length === 0) return [];
    return [
      {
        armKey: r.armKey,
        caseId: r.caseId,
        sample: r.sample,
        outputId,
        slots: requests.map((q) => q.slot),
        targets: requests.map((q) => ({ key: `${outputId}-${q.slot}`, request: q.request, samples: 1 })),
        changes: appliedChanges(kept.story, kept.reply),
      },
    ];
  });
}

/** Every reply as the report lists it: its applied changes, and the judge's verdict and evidence on its first player. */
export function moneyReplyRows(lookup: Lookup, judged: (key: string) => { verdict?: boolean; evidence?: string }): MoneyReplyRow[] {
  return moneyRepliesToJudge(lookup).map((r) => {
    const said = judged(r.targets[0]?.key ?? "");
    return { armKey: r.armKey, caseId: r.caseId, sample: r.sample, outputId: r.outputId, changes: r.changes, ...said };
  });
}

/** Every target once, at the most samples any reading asks of it. */
function mergedTargets(targets: MoneyTarget[]): MoneyTarget[] {
  const byKey = new Map<string, MoneyTarget>();
  for (const t of targets) {
    const known = byKey.get(t.key);
    if (!known || known.samples < t.samples) byKey.set(t.key, { ...t, samples: Math.max(t.samples, known?.samples ?? 0) });
  }
  return [...byKey.values()];
}

/** The judge calls a run sends: every target, or with --cases (a smoke) the calibration items and replies named, by item id or case id. */
export function moneyTargetsToSend(calibration: MoneyCalibrationTarget[], replies: MoneyReply[], caseIds: string[] | undefined): MoneyTarget[] {
  const items = caseIds ? calibration.filter((t) => caseIds.includes(t.itemId)) : calibration;
  const read = caseIds ? replies.filter((r) => caseIds.includes(r.caseId)) : replies;
  return mergedTargets([...items, ...read.flatMap((r) => r.targets)]);
}

/** A reply's verdict as a judged plan the stage readings take (every judged player passes); undefined while any of its calls is unanswered. */
export function moneyReplyAsPlan(reply: MoneyReply, answerOf: (key: string) => boolean | undefined): JudgedPlan | undefined {
  const passes = replyVerdict(reply.targets.map((t) => answerOf(t.key)));
  return passes === undefined ? undefined : { armKey: reply.armKey, caseId: reply.caseId, sample: reply.sample, outputId: reply.outputId, passes, threads: reply.targets.length };
}

const referencesOf = (key: string): string[] => [referenceKeyOf(key), ...secondReferenceKeys(key)].filter((k): k is string => typeof k === "string");

/** The readings on each arm: the variant against production under the stop rule. */
export function moneyReadings(verdicts: JudgedPlan[]) {
  return stageReadings(verdicts, referencesOf);
}

const runsOf = (ctx: Pick<PrepContext, "files">): RunsByRound => ({ 1: playthroughRunsFrom(ctx.files.readPlaythroughs()), 2: playthroughRunsFrom(ctx.files.readPlaythroughs(PLAYTHROUGHS_2)) });

/** The prompt hash each stored playthrough call sent, by its output file. */
const promptHashesOf = (ctx: Pick<PrepContext, "files">) => {
  const byId = new Map(ctx.files.readPrepRecords().flatMap((r) => (r.outputFile && r.promptHash ? [[outputIdOf(r.outputFile), r.promptHash] as [string, string]] : [])));
  return (outputFile: string) => byId.get(outputIdOf(outputFile));
};

// --- --build-money-cases ---

export function buildMoneyCasesMode(ctx: Pick<PrepContext, "files" | "log">, replace: boolean): void {
  const { files, log } = ctx;
  if (!files.casesExist()) throw new Error("No frozen cases. Run --build-cases first.");
  const runs = runsOf(ctx)[2];
  if (runs.length === 0) throw new Error("No stored second-round playthroughs (playthroughs-2.json). Run --playthroughs --round 2 first.");
  const { cases, problems, skipped } = moneyAddsUpCasesToFreeze(files.readCases(), runs, promptHashesOf(ctx), replace);
  if (problems.length) throw new Error(problems.join("; "));
  if (skipped.length) log(`Already frozen, left as they are: ${skipped.join(", ")}.`);
  if (cases.length === 0) return log("Nothing new to freeze; no calls.");
  files.addCases(cases, undefined, replace);
  log(`Froze ${cases.map((c) => c.id).join(", ")} beside the other cases; no calls.`);
}

// --- --judge-money ---

export async function judgeMoneyMode(ctx: PrepContext, options: { caseIds?: string[] } = {}): Promise<void> {
  const { files, log } = ctx;
  const runs = runsOf(ctx);
  const lookup = { records: files.readRecords(), cases: files.readCases(), load: files.loadOutput };
  const { targets: calibration, problems } = moneyCalibrationTargets(runs, lookup);
  const replies = moneyRepliesToJudge(lookup);
  const targets = moneyTargetsToSend(calibration, replies, options.caseIds);
  const arm = JUDGE_ARMS[0];
  const jobs = moneyJudgeJobs(targets, arm, MONEY_ADDS_UP_PROMPT_STATE, STAGE);
  const done = finishedJobKeys(files.readPrepRecords());
  const open = jobs.filter((j) => !done.has(keyOf(j)));
  const estimate = open.reduce((sum, j) => sum + jobEstimateUsd(j), 0);
  ctx.refuse(STAGE, estimate);
  log(`${calibration.length} calibration items, ${replies.length} replies of the stage's arms on ${arm.key} (stage ${STAGE}): ${jobs.length} calls, ${open.length} open, est $${estimate.toFixed(3)}`);
  const result = await runJobs(jobs, ctx.deps("prep"), { caps: ctx.caps, previous: files.readPrepRecords(), extraSpend: spendBeside(files, "prep"), tokensPerMinute: ctx.tpm, maxInFlight: ctx.maxInFlight });
  if (result.stoppedReason) log(`Stopped: ${result.stoppedReason}`);
  writeJudgedMoney(ctx, calibration, lookup, problems);
}

/** judged-money.md and .json from every judge call so far; no calls. */
export function writeJudgedMoney(ctx: Pick<PrepContext, "files" | "log">, calibration: MoneyCalibrationTarget[], lookup: Lookup, problems: string[]): void {
  const { files, log } = ctx;
  const prep = files.readPrepRecords();
  const arm = JUDGE_ARMS[0];
  const parsedAt = (key: string, sample: number) => {
    const record = finishedPrepRecord(prep, jobKey(moneyJudgeCaseId(key), prepArmKey("judge", arm), MONEY_ADDS_UP_PROMPT_STATE, sample));
    return record ? files.loadOutput(record) : undefined;
  };
  const judged = calibration.map((t) => {
    const parsed = [1, 2].map((sample) => parsedAt(t.key, sample));
    return { itemId: t.itemId, samples: parsed.map(moneyVerdictFrom), evidence: parsed.map(moneyEvidenceFrom) };
  });
  const replies = moneyRepliesToJudge(lookup);
  const verdicts = replies.flatMap((r) => [moneyReplyAsPlan(r, (key) => moneyVerdictFrom(parsedAt(key, 1)))].filter((v): v is JudgedPlan => v !== undefined));
  const rows = moneyReplyRows(lookup, (key) => {
    const parsed = parsedAt(key, 1);
    const said = moneyEvidenceFrom(parsed);
    return { verdict: moneyVerdictFrom(parsed), evidence: [said.evidence ?? "", said.lines.length ? `[${said.lines.join("; ")}]` : ""].filter(Boolean).join(" ") };
  });
  const calibrationReading = scoreMoneyCalibration(MONEY_CALIBRATION, judged);
  const report = { calibration: calibrationReading, items: MONEY_CALIBRATION, judged, readings: moneyReadings(verdicts), rows };
  const spentUsd = prep.filter((r) => r.stage === STAGE).reduce((sum, r) => sum + r.costUsd, 0);
  const generatedAt = new Date();
  files.writeJudgedMoney(renderMoneyJudge({ report, spentUsd, generatedAt, problems }), {
    generatedAt: generatedAt.toISOString(),
    promptState: MONEY_ADDS_UP_PROMPT_STATE,
    promptVersion: MONEY_JUDGE_PROMPT_VERSION,
    report,
    verdicts,
    problems,
    spentUsd,
  });
  const c = calibrationReading;
  log(`figuresAddUp: ${c.agree} of ${c.decided} agree (hand yes ${c.handPasses}, no ${c.handFails}), samples ${c.pairsAgree} of ${c.pairs}: ${c.reliable ? "reliable" : "not reliable"}`);
  for (const r of report.readings) log(`  ${r.armKey}: ${r.plans.hits} of ${r.plans.n} pass${r.vsReference && r.referenceKey ? `; against ${r.referenceKey} ${r.vsReference.arm.hits}/${r.vsReference.arm.n} vs ${r.vsReference.reference.hits}/${r.vsReference.reference.n}${r.vsReference.moved ? `, moved ${r.vsReference.moved}` : r.vsReference.beyondNoise ? ", beyond the noise, not moved" : ""}` : ""}`);
  log(`The stage's judge calls so far $${spentUsd.toFixed(4)}. Wrote judged-money.md and .json.`);
}
