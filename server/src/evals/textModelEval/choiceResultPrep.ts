import type { PlayerSlot, SetOfBeatGenerationSchema, ThreadAnalysis } from "core/types/index.js";
import { repairBeatReply } from "../../game/services/beatRepairs.js";
import { checkThreadPlan } from "../../game/services/planChecks.js";
import {
  CHOICE_RESULT_BUILT_CASES,
  CHOICE_RESULT_PLANNER_PROMPT_STATE,
  CHOICE_RESULT_PROMPT_STATE,
  CHOICE_RESULT_STORED_CASES,
  CHOICE_RESULT_STORED_PLAN_CASES,
  armKey,
  secondReferenceKeys,
  type Stage,
} from "./arms.js";
import type { LedgerStage } from "./budget.js";
import { caseStory, type EvalCase } from "./cases.js";
import { choiceResultCasesToFreeze } from "./choiceResultCases.js";
import {
  CHOICE_JUDGE_PROMPT_VERSION,
  OPTIONS_CALIBRATION,
  OPTIONS_CHECK,
  RESULTS_CALIBRATION,
  RESULTS_CHECK,
  choiceJudgeCaseId,
  choiceJudgeJobs,
  evidenceFrom,
  optionsJudgeRequest,
  renderChoiceResultJudge,
  resultsJudgeRequest,
  scoreChoiceCalibration,
  verdictFrom,
  type ChoiceCheck,
  type ChoiceCheckReport,
  type ChoiceFailure,
  type ChoiceTarget,
  type OptionsCalibrationItem,
  type ResultsCalibrationItem,
} from "./choiceResultJudge.js";
import { jobEstimateUsd } from "./jobPlan.js";
import { JUDGE_ARMS, outputIdOf } from "./judgedChecks.js";
import { playthroughRunsFrom } from "./playthroughMode.js";
import { replayedTurn } from "./playthroughReplay.js";
import type { PlayRun } from "./playthroughs.js";
import { finishedPrepRecord, prepArmKey } from "./prepCalls.js";
import { finishedJobKeys, jobKey, keyOf, runJobs, usable, type CallRecord } from "./runner.js";
import { stageReadings, type JudgedPlan } from "./stageJudge.js";
import { checkBeatDesign } from "./turnDesignChecks.js";
import { spendBeside, type PrepContext } from "./turnPrep.js";
import { referenceKeyOf } from "./variantComparison.js";

/*
 * The choice-result stage's CLI modes (2026-09-30), kept out of run.ts:
 * - --build-choice-cases: the stage's cases from the playthroughs' stored runs
 *   (choiceResultCases.ts), each only where its request is the one production
 *   sent there, frozen beside the others (those already frozen left as they
 *   are, unless --rebuild-cases); no calls;
 * - --judge-choice-results: the two judged checks (choiceResultJudge.ts) on
 *   their calibration (two samples each, from the playthroughs' stored runs,
 *   replayed) and on the stage's own records (one sample each): every final
 *   usable turn of the turn arms under adopted5 on the stage's turn cases, one
 *   call per exploring player (optionsFollowResults), and every final usable
 *   plan of the planner arms under round0 on the stage's plan cases, one call
 *   per plan (resultsFitKind); into prep-calls.jsonl, booked to the stage, then
 *   judged-choice-results.md and .json. A turn is read as the game keeps it
 *   (the beat repairs), a plan after the plan check.
 */

const STAGE: Stage = "choice-result";
const CALIBRATION_SAMPLES = 2;

const luna = (effort: "low" | "medium", variant: "adopted" | "choiceResult" | "planV2e" | "planV2f") => armKey({ model: "gpt-6-luna", reasoningEffort: effort }, variant);

/** The stage's turn arms: production's turn and the variant, on the single-player and the group turn model. */
export const CHOICE_TURN_ARMS = [luna("medium", "adopted"), luna("medium", "choiceResult"), luna("low", "adopted"), luna("low", "choiceResult")];
/** The stage's planner arms: production's chapter planner (planner v2e) and planner v2f. */
export const CHOICE_PLAN_ARMS = [luna("low", "planV2e"), luna("low", "planV2f")];

const TURN_CASES = new Set<string>([...CHOICE_RESULT_STORED_CASES, ...CHOICE_RESULT_BUILT_CASES.single, ...CHOICE_RESULT_BUILT_CASES.groups]);
const PLAN_CASES = new Set<string>([...CHOICE_RESULT_BUILT_CASES.plans, ...CHOICE_RESULT_STORED_PLAN_CASES]);

type Lookup = { records: CallRecord[]; cases: EvalCase[]; load: (record: CallRecord) => unknown };

export type CalibrationTarget = ChoiceTarget & { itemId: string };

/** The hand-read items' judge requests from the stored runs (replayed), each at two samples, and what could not be built. */
export function calibrationTargets(runs: PlayRun[], options: OptionsCalibrationItem[] = OPTIONS_CALIBRATION, results: ResultsCalibrationItem[] = RESULTS_CALIBRATION): { targets: CalibrationTarget[]; problems: string[] } {
  const problems: string[] = [];
  const targets: CalibrationTarget[] = [];
  for (const item of options) {
    try {
      const { before, played } = replayedTurn(runs, item.story, item.turn);
      const request = played.reply ? optionsJudgeRequest(before, played.reply, item.slot) : undefined;
      if (!request) throw new Error(`turn ${item.turn} of ${item.story} is no exploration step for ${item.slot}`);
      targets.push({ itemId: item.id, check: OPTIONS_CHECK, key: `cal-${item.id}`, request, samples: CALIBRATION_SAMPLES });
    } catch (error) {
      problems.push(`${item.id}: ${(error as Error).message}`);
    }
  }
  for (const item of results) {
    try {
      const { beforePlan, played } = replayedTurn(runs, item.story, item.turn);
      const request = played.plan?.kind === "chapter plan" && played.plan.plan ? resultsJudgeRequest(beforePlan, played.plan.plan as ThreadAnalysis) : undefined;
      if (!request) throw new Error(`turn ${item.turn} of ${item.story} planned no chapter`);
      targets.push({ itemId: item.id, check: RESULTS_CHECK, key: `cal-${item.id}`, request, samples: CALIBRATION_SAMPLES });
    } catch (error) {
      problems.push(`${item.id}: ${(error as Error).message}`);
    }
  }
  return { targets, problems };
}

/** A reply or plan of the stage's arms, with its judge calls. */
export type ToJudge = { armKey: string; caseId: string; sample: number; outputId: string; targets: (ChoiceTarget & { slot?: PlayerSlot })[] };

/** Every final usable turn of the turn arms under the stage's tag on its turn cases, one call per exploring player, read after the beat repairs. */
export function turnsToJudgeOptions({ records, cases, load }: Lookup): ToJudge[] {
  const byId = new Map(cases.map((c) => [c.id, c]));
  return records.flatMap((r): ToJudge[] => {
    if (r.group !== "beat" || !r.final || !usable(r) || !r.outputFile || r.promptState !== CHOICE_RESULT_PROMPT_STATE || !CHOICE_TURN_ARMS.includes(r.armKey)) return [];
    const evalCase = byId.get(r.caseId);
    if (!evalCase?.state || !TURN_CASES.has(r.caseId)) return [];
    const parsed = load(r) as SetOfBeatGenerationSchema | undefined;
    if (!parsed) return [];
    const story = caseStory(evalCase);
    const reply = repairBeatReply(story, parsed).reply;
    const outputId = outputIdOf(r.outputFile);
    const targets = story.getPlayerSlots().flatMap((slot) => {
      const request = optionsJudgeRequest(story, reply, slot as PlayerSlot);
      return request ? [{ check: OPTIONS_CHECK, key: `${outputId}-${slot}`, request, samples: 1, slot: slot as PlayerSlot }] : [];
    });
    return targets.length ? [{ armKey: r.armKey, caseId: r.caseId, sample: r.sample, outputId, targets }] : [];
  });
}

/** Every final usable plan of the planner arms under the planners' tag on the stage's plan cases, one call per plan, after the plan check. */
export function plansToJudgeResults({ records, cases, load }: Lookup): ToJudge[] {
  const byId = new Map(cases.map((c) => [c.id, c]));
  return records.flatMap((r): ToJudge[] => {
    if (r.group !== "thread" || r.role !== "thread" || !r.final || !usable(r) || !r.outputFile || r.promptState !== CHOICE_RESULT_PLANNER_PROMPT_STATE || !CHOICE_PLAN_ARMS.includes(r.armKey)) return [];
    const evalCase = byId.get(r.caseId);
    if (!evalCase?.state || !PLAN_CASES.has(r.caseId)) return [];
    const written = load(r) as ThreadAnalysis | undefined;
    if (!written) return [];
    const story = caseStory(evalCase, false);
    const request = resultsJudgeRequest(story, checkThreadPlan(story, written).plan);
    const outputId = outputIdOf(r.outputFile);
    return request ? [{ armKey: r.armKey, caseId: r.caseId, sample: r.sample, outputId, targets: [{ check: RESULTS_CHECK, key: outputId, request, samples: 1 }] }] : [];
  });
}

/** A reply's or plan's verdict from its sample-1 answers, as a judged plan the stage readings take; undefined while any is unanswered. */
export function replyVerdict(item: ToJudge, answerOf: (key: string) => boolean | undefined): JudgedPlan | undefined {
  const answers = item.targets.map((t) => answerOf(t.key));
  if (answers.some((a) => a === undefined)) return undefined;
  return { armKey: item.armKey, caseId: item.caseId, sample: item.sample, outputId: item.outputId, passes: answers.every(Boolean), threads: item.targets.length };
}

export type ProxyAgreement = { handYes: number; yesAgree: number; handNo: number; noAgree: number; partial: number; unread: number };

/**
 * The deterministic word check (explorationOptionsFollowResults, turnDesignChecks.ts)
 * on the options items, each item's player read alone, against the hand.
 */
export function proxyAgreement(runs: PlayRun[], items: OptionsCalibrationItem[] = OPTIONS_CALIBRATION): ProxyAgreement {
  const a: ProxyAgreement = { handYes: 0, yesAgree: 0, handNo: 0, noAgree: 0, partial: 0, unread: 0 };
  for (const item of items) {
    let reading: boolean | undefined;
    try {
      const { before, played } = replayedTurn(runs, item.story, item.turn);
      const own = played.reply ? ({ ...played.reply, ...Object.fromEntries(before.getPlayerSlots().filter((s) => s !== item.slot).map((s) => [s, undefined])) } as SetOfBeatGenerationSchema) : undefined;
      reading = own ? checkBeatDesign(before, own, own).checks.explorationOptionsFollowResults : undefined;
    } catch {
      reading = undefined;
    }
    if (reading === undefined) {
      a.unread++;
      continue;
    }
    if (item.hand === "partial") a.partial++;
    else if (item.hand) {
      a.handYes++;
      if (reading) a.yesAgree++;
    } else {
      a.handNo++;
      if (!reading) a.noAgree++;
    }
  }
  return a;
}

/** Every target once, at the most samples any reading asks of it. */
function mergedTargets(targets: ChoiceTarget[]): ChoiceTarget[] {
  const byKey = new Map<string, ChoiceTarget>();
  for (const t of targets) {
    const id = `${t.check}|${t.key}`;
    const known = byKey.get(id);
    if (!known || known.samples < t.samples) byKey.set(id, { ...t, samples: Math.max(t.samples, known?.samples ?? 0) });
  }
  return [...byKey.values()];
}

const referencesOf = (key: string) => [referenceKeyOf(key), ...secondReferenceKeys(key)].filter((k): k is string => typeof k === "string");

const runsOf = (ctx: Pick<PrepContext, "files">): PlayRun[] => playthroughRunsFrom(ctx.files.readPlaythroughs());

/** The prompt hash each stored playthrough call sent, by its output file. */
const promptHashesOf = (ctx: Pick<PrepContext, "files">) => {
  const byId = new Map(ctx.files.readPrepRecords().flatMap((r) => (r.outputFile && r.promptHash ? [[outputIdOf(r.outputFile), r.promptHash] as [string, string]] : [])));
  return (outputFile: string) => byId.get(outputIdOf(outputFile));
};

// --- --build-choice-cases ---

export function buildChoiceCasesMode(ctx: Pick<PrepContext, "files" | "log">, replace: boolean): void {
  const { files, log } = ctx;
  if (!files.casesExist()) throw new Error("No frozen cases. Run --build-cases first.");
  const runs = runsOf(ctx);
  if (runs.length === 0) throw new Error("No stored playthroughs (playthroughs.json). Run --playthroughs first.");
  const { cases, problems, skipped } = choiceResultCasesToFreeze(files.readCases(), runs, promptHashesOf(ctx), replace);
  if (problems.length) throw new Error(problems.join("; "));
  if (skipped.length) log(`Already frozen, left as they are: ${skipped.join(", ")}.`);
  if (cases.length === 0) return log("Nothing new to freeze; no calls.");
  files.addCases(cases, undefined, replace);
  log(`Froze ${cases.map((c) => c.id).join(", ")} beside the other cases; no calls.`);
}

// --- --judge-choice-results ---

export async function judgeChoiceResultsMode(ctx: PrepContext, options: { stage?: LedgerStage; caseIds?: string[] } = {}): Promise<void> {
  const { files, log } = ctx;
  const stage = options.stage ?? STAGE;
  const runs = runsOf(ctx);
  const lookup = { records: files.readRecords(), cases: files.readCases(), load: files.loadOutput };
  const { targets: calibration, problems } = calibrationTargets(runs);
  const turns = turnsToJudgeOptions(lookup);
  const plans = plansToJudgeResults(lookup);
  // With --cases (a smoke): only the calibration items and cases named; the file is written over everything judged so far
  const named = options.caseIds;
  const read = [...turns, ...plans].filter((t) => !named || named.includes(t.caseId));
  const targets = mergedTargets([...(named ? calibration.filter((t) => named.includes(t.itemId)) : calibration), ...read.flatMap((t) => t.targets)]);
  const arm = JUDGE_ARMS[0];
  const jobs = choiceJudgeJobs(targets, arm, CHOICE_RESULT_PROMPT_STATE, stage as Stage);
  const done = finishedJobKeys(files.readPrepRecords());
  const open = jobs.filter((j) => !done.has(keyOf(j)));
  const estimate = open.reduce((sum, j) => sum + jobEstimateUsd(j), 0);
  ctx.refuse(stage, estimate);
  log(`${calibration.length} calibration items, ${turns.length} turns and ${plans.length} plans of the stage's arms on ${arm.key} (stage ${stage}): ${jobs.length} calls, ${open.length} open, est $${estimate.toFixed(3)}`);
  const result = await runJobs(jobs, ctx.deps("prep"), { caps: ctx.caps, previous: files.readPrepRecords(), extraSpend: spendBeside(files, "prep"), tokensPerMinute: ctx.tpm, maxInFlight: ctx.maxInFlight });
  if (result.stoppedReason) log(`Stopped: ${result.stoppedReason}`);
  writeJudgedChoiceResults(ctx, runs, calibration, turns, plans, problems);
}

function writeJudgedChoiceResults(ctx: Pick<PrepContext, "files" | "log">, runs: PlayRun[], calibration: CalibrationTarget[], turns: ToJudge[], plans: ToJudge[], problems: string[]) {
  const { files, log } = ctx;
  const prep = files.readPrepRecords();
  const arm = JUDGE_ARMS[0];
  const parsedAt = (check: ChoiceCheck, key: string, sample: number) => {
    const record = finishedPrepRecord(prep, jobKey(choiceJudgeCaseId(check, key), prepArmKey("judge", arm), CHOICE_RESULT_PROMPT_STATE, sample));
    return record ? files.loadOutput(record) : undefined;
  };
  const report = (check: ChoiceCheck, items: { id: string; hand: OptionsCalibrationItem["hand"]; note: string }[], judgedItems: ToJudge[]): ChoiceCheckReport => {
    const judged = calibration
      .filter((t) => t.check === check)
      .map((t) => {
        const parsed = [1, 2].map((sample) => parsedAt(check, t.key, sample));
        return { itemId: t.itemId, samples: parsed.map((p) => verdictFrom(p, check)), evidence: parsed.map((p) => evidenceFrom(p, check)) };
      });
    const verdicts = judgedItems.flatMap((item) => {
      const verdict = replyVerdict(item, (key) => verdictFrom(parsedAt(check, key, 1), check));
      return verdict ? [verdict] : [];
    });
    const failures: ChoiceFailure[] = judgedItems.flatMap((item) =>
      item.targets.flatMap((t) => {
        const parsed = parsedAt(check, t.key, 1);
        if (verdictFrom(parsed, check) !== false) return [];
        const said = evidenceFrom(parsed, check);
        return [{ armKey: item.armKey, caseId: item.caseId, sample: item.sample, outputId: item.outputId, ...(t.slot ? { slot: t.slot } : {}), evidence: `${said.evidence ?? ""} [${said.lines.join("; ")}]` }];
      })
    );
    return { check, items, calibration: scoreChoiceCalibration(check, items, judged), judged, readings: stageReadings(verdicts, referencesOf), failures };
  };
  const checks = [report(OPTIONS_CHECK, OPTIONS_CALIBRATION, turns), report(RESULTS_CHECK, RESULTS_CALIBRATION, plans)];
  const proxy = proxyAgreement(runs);
  const spentUsd = prep.filter((r) => r.caseId.startsWith("judge-choice-")).reduce((sum, r) => sum + r.costUsd, 0);
  const generatedAt = new Date();
  const markdown = `${renderChoiceResultJudge({ checks, spentUsd, generatedAt, problems })}\nThe deterministic word check (explorationOptionsFollowResults) on the options items: hand yes ${proxy.yesAgree} of ${proxy.handYes} agree, hand no ${proxy.noAgree} of ${proxy.handNo}, ${proxy.partial} partial, ${proxy.unread} unread.\n`;
  files.writeJudgedChoiceResults(markdown, { generatedAt: generatedAt.toISOString(), promptVersion: CHOICE_JUDGE_PROMPT_VERSION, checks, proxy, problems, spentUsd });
  for (const c of checks) {
    const s = c.calibration;
    log(`${c.check}: ${s.agree} of ${s.decided} agree (hand yes ${s.handPasses}, no ${s.handFails}), samples ${s.pairsAgree} of ${s.pairs}: ${s.reliable ? "reliable" : "not reliable"}`);
    for (const r of c.readings) log(`  ${r.armKey}: ${r.plans.hits} of ${r.plans.n} pass${r.vsReference && r.referenceKey ? `; against ${r.referenceKey} ${r.vsReference.arm.hits}/${r.vsReference.arm.n} vs ${r.vsReference.reference.hits}/${r.vsReference.reference.n}${r.vsReference.moved ? `, moved ${r.vsReference.moved}` : r.vsReference.beyondNoise ? ", beyond the noise, not moved" : ""}` : ""}`);
  }
  log(`The word check on the options items: yes ${proxy.yesAgree}/${proxy.handYes}, no ${proxy.noAgree}/${proxy.handNo}. Choice judge calls so far $${spentUsd.toFixed(4)}. Wrote judged-choice-results.md and .json.`);
}
