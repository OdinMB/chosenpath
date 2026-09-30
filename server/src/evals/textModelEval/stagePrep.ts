import type { Story } from "core/models/Story.js";
import type { ThreadAnalysis } from "core/types/index.js";
import { checkThreadPlan } from "../../game/services/planChecks.js";
import type { TextRequest } from "../../game/services/storyTextSteps.js";
import { secondReferenceKeys, type Stage } from "./arms.js";
import type { LedgerStage } from "./budget.js";
import { caseStory, type EvalCase } from "./cases.js";
import { collectChapters } from "./chapterFrames.js";
import { jobEstimateUsd } from "./jobPlan.js";
import { JUDGE_ARMS, outputIdOf } from "./judgedChecks.js";
import { finishedPrepRecord, prepArmKey } from "./prepCalls.js";
import { finishedJobKeys, jobKey, keyOf, runJobs, usable, type CallRecord } from "./runner.js";
import { stageCasesToFreeze } from "./stageCases.js";
import {
  STAGE_JUDGE_CALIBRATION,
  STAGE_JUDGE_PROMPT_VERSION,
  judgedThread,
  renderStageJudge,
  scoreStageCalibration,
  stageEvidenceFrom,
  stageJudgeCaseId,
  stageJudgeJobs,
  stageJudgeRequest,
  stageReadings,
  stageVerdictFrom,
  type JudgedPlan,
  type JudgedThread,
  type StageCalibrationItem,
  type StageFailure,
} from "./stageJudge.js";
import { spendBeside, type PrepContext } from "./turnPrep.js";
import { referenceKeyOf } from "./variantComparison.js";

/*
 * The stage scoping's CLI modes (the owner's feedback of 2026-09-29), kept
 * out of run.ts and turnPrep.ts:
 * - --build-stage-cases: the Arielle story's first chapter and (2026-09-30)
 *   the climax arm's three last chapters as chapter-planning cases
 *   (stageCases.ts), frozen beside the others (those already frozen left as
 *   they are, unless --rebuild-cases); no calls;
 * - --judge-stages: the judged stage check (stageJudge.ts) on its calibration
 *   set (two samples each), the stored chapters the cases read, and every
 *   final usable isolated chapter plan of the arms given (one sample each),
 *   into prep-calls.jsonl, then judged-stages.md and .json. A plan is read as
 *   the game keeps it (the plan check's repairs), and one judge call serves a
 *   thread wherever it is read: the calibration's sample 1 is also its reading.
 */

/** What a judge call reads, and how many samples it gets. */
export type StageTarget = { key: string; request: TextRequest; samples: number };

/** The stored chapter every case reads, pseudo-arm of the readings (the plans written in play). */
export const STORED_CHAPTERS = "stored chapters (in play)";

const CALIBRATION_SAMPLES = 2;

type Lookup = { records: CallRecord[]; cases: EvalCase[]; load: (record: CallRecord) => unknown };

/** A stored plan's story and threads as the game keeps them: the case before analysis, the plan after the plan check. */
function storedPlan(outputId: string, { records, cases, load }: Lookup): { story: Story; threads: JudgedThread[]; record: CallRecord } | undefined {
  const record = records.find((r) => r.outputFile && outputIdOf(r.outputFile) === outputId && r.role === "thread" && usable(r));
  const evalCase = record ? cases.find((c) => c.id === record.caseId) : undefined;
  if (!record || !evalCase?.state) return undefined;
  const story = caseStory(evalCase, false);
  const plan = checkThreadPlan(story, load(record) as ThreadAnalysis).plan;
  return { story, threads: (plan.threads ?? []).map(judgedThread), record };
}

/** Each stored chapter's story at its start and its threads (chapterFrames.ts), keyed by chapter. */
function storedChapters(cases: EvalCase[]): Map<string, { story: Story; threads: JudgedThread[] }> {
  return new Map(collectChapters(cases).map((c) => [c.chapterKey, { story: c.story, threads: c.threads.map(judgedThread) }]));
}

/** A constructed version: the base plan's last step question and milestones replaced, its last step's results with them. */
function constructedThread(thread: JudgedThread, edit: { lastStepQuestion: string; milestones: Record<string, string> }): JudgedThread {
  const last = thread.progression.length - 1;
  return {
    ...thread,
    possibleMilestones: edit.milestones,
    progression: thread.progression.map((step, i) => (i === last ? { ...step, question: edit.lastStepQuestion, possibleResolutions: edit.milestones } : step)),
  };
}

/** The key a calibration item's judge call goes under: its stored plan's or chapter's thread, or the constructed item's own. */
export function calibrationKey(item: StageCalibrationItem): string {
  const index = item.thread ?? 0;
  if ("output" in item.source) return `${item.source.output}-t${index}`;
  if ("chapter" in item.source) return `chapter-${item.source.chapter}-t${index}`;
  return `hand-${item.id}`;
}

/** The calibration items' judge requests, each at two samples, and what could not be built. */
export function calibrationTargets(items: StageCalibrationItem[], lookup: Lookup): { targets: (StageTarget & { itemId: string })[]; problems: string[] } {
  const chapters = storedChapters(lookup.cases);
  const problems: string[] = [];
  const targets = items.flatMap((item) => {
    const index = item.thread ?? 0;
    const source = "chapter" in item.source ? chapters.get(item.source.chapter) : storedPlan("output" in item.source ? item.source.output : item.source.constructed.from, lookup);
    const thread = source?.threads[index];
    if (!source || !thread) {
      problems.push(`${item.id}: no stored plan or chapter to read`);
      return [];
    }
    const read = "constructed" in item.source ? constructedThread(thread, item.source.constructed) : thread;
    const request = stageJudgeRequest(source.story, read);
    if (!request) {
      problems.push(`${item.id}: the check does not apply (no later stage)`);
      return [];
    }
    return [{ itemId: item.id, key: calibrationKey(item), request, samples: CALIBRATION_SAMPLES }];
  });
  return { targets, problems };
}

/** A plan of the arms to judge, with the judge calls its threads need (none where the check applies to no thread). */
export type PlanToJudge = { armKey: string; caseId: string; sample: number; outputId: string; targets: StageTarget[] };

/** Every final usable isolated chapter plan of the arms in the prompt state, read as the game keeps it. */
export function plansToJudge(armKeys: string[], promptState: string, lookup: Lookup): PlanToJudge[] {
  return lookup.records.flatMap((r): PlanToJudge[] => {
    if (r.group !== "thread" || r.role !== "thread" || !r.final || !usable(r) || !r.outputFile || r.promptState !== promptState || !armKeys.includes(r.armKey)) return [];
    const outputId = outputIdOf(r.outputFile);
    const plan = storedPlan(outputId, { ...lookup, records: [r] });
    if (!plan) return [];
    const targets = plan.threads.flatMap((thread, i) => {
      const request = stageJudgeRequest(plan.story, thread);
      return request ? [{ key: `${outputId}-t${i}`, request, samples: 1 }] : [];
    });
    return targets.length ? [{ armKey: r.armKey, caseId: r.caseId, sample: r.sample, outputId, targets }] : [];
  });
}

/** Each stored chapter the cases read, as one plan of the pseudo-arm (sample 1). */
export function chaptersToJudge(cases: EvalCase[]): PlanToJudge[] {
  return collectChapters(cases).flatMap((chapter) => {
    const targets = chapter.threads.map(judgedThread).flatMap((thread, i) => {
      const request = stageJudgeRequest(chapter.story, thread);
      return request ? [{ key: `chapter-${chapter.chapterKey}-t${i}`, request, samples: 1 }] : [];
    });
    return targets.length ? [{ armKey: STORED_CHAPTERS, caseId: chapter.chapterKey, sample: 1, outputId: `chapter-${chapter.chapterKey}`, targets }] : [];
  });
}

/** Every target once, at the most samples any reading asks of it. */
export function mergedTargets(targets: StageTarget[]): StageTarget[] {
  const byKey = new Map<string, StageTarget>();
  for (const t of targets) {
    const known = byKey.get(t.key);
    if (!known || known.samples < t.samples) byKey.set(t.key, { ...t, samples: Math.max(t.samples, known?.samples ?? 0) });
  }
  return [...byKey.values()];
}

/** The judge calls a run sends: every target, or with --cases (a smoke) the calibration items and plans named, by item id or case id. */
export function smokeTargets(calibration: (StageTarget & { itemId: string })[], plans: PlanToJudge[], caseIds: string[] | undefined): StageTarget[] {
  const items = caseIds ? calibration.filter((t) => caseIds.includes(t.itemId)) : calibration;
  const read = caseIds ? plans.filter((p) => caseIds.includes(p.caseId)) : plans;
  return mergedTargets([...items, ...read.flatMap((p) => p.targets)]);
}

/** A plan's verdict from its threads' sample-1 answers: every thread passing; undefined while any is unanswered. */
export function planVerdict(plan: PlanToJudge, answerOf: (key: string) => boolean | undefined): JudgedPlan | undefined {
  const answers = plan.targets.map((t) => answerOf(t.key));
  if (answers.some((a) => a === undefined)) return undefined;
  return { armKey: plan.armKey, caseId: plan.caseId, sample: plan.sample, outputId: plan.outputId, passes: answers.every(Boolean), threads: plan.targets.length };
}

/** A candidate's references for the stage readings: its own, then its second ones. */
const referencesOf = (armKey: string) => [referenceKeyOf(armKey), ...secondReferenceKeys(armKey)].filter((k): k is string => typeof k === "string");

// --- --build-stage-cases ---

export function buildStageCasesMode(ctx: Pick<PrepContext, "files" | "log">, replace: boolean): void {
  const { files, log } = ctx;
  if (!files.casesExist()) throw new Error("No frozen cases. Run --build-cases first.");
  const { cases, problems, skipped } = stageCasesToFreeze(files.readCases(), replace);
  if (problems.length) throw new Error(problems.join("; "));
  if (skipped.length) log(`Already frozen, left as they are: ${skipped.join(", ")}.`);
  if (cases.length === 0) return log("Nothing new to freeze; no calls.");
  files.addCases(cases, undefined, replace);
  log(`Froze ${cases.map((c) => c.id).join(", ")} beside the other cases; no calls.`);
}

// --- --judge-stages ---

export async function judgeStagesMode(ctx: PrepContext, armKeys: string[] | undefined, promptState: string, options: { stage?: LedgerStage; caseIds?: string[] } = {}): Promise<void> {
  const { files, log } = ctx;
  const stage = options.stage ?? "stage-scoping";
  const lookup = { records: files.readRecords(), cases: files.readCases(), load: files.loadOutput };
  const { targets: calibration, problems } = calibrationTargets(STAGE_JUDGE_CALIBRATION, lookup);
  const plans = [...plansToJudge(armKeys ?? [], promptState, lookup), ...chaptersToJudge(lookup.cases)];
  // The file is written over everything judged so far, whatever this run sent
  const targets = smokeTargets(calibration, plans, options.caseIds);
  const arm = JUDGE_ARMS[0];
  const jobs = stageJudgeJobs(targets, arm, promptState, stage as Stage);
  const done = finishedJobKeys(files.readPrepRecords());
  const open = jobs.filter((j) => !done.has(keyOf(j)));
  const estimate = open.reduce((sum, j) => sum + jobEstimateUsd(j), 0);
  ctx.refuse(stage, estimate);
  log(`${calibration.length} calibration items, ${plans.length} plans (${armKeys?.length ?? 0} arms and the stored chapters) on ${arm.key} (stage ${stage}): ${jobs.length} calls, ${open.length} open, est $${estimate.toFixed(3)}`);
  const result = await runJobs(jobs, ctx.deps("prep"), { caps: ctx.caps, previous: files.readPrepRecords(), extraSpend: spendBeside(files, "prep"), tokensPerMinute: ctx.tpm, maxInFlight: ctx.maxInFlight });
  if (result.stoppedReason) log(`Stopped: ${result.stoppedReason}`);
  writeJudgedStages(ctx, calibration, plans, problems, promptState);
}

function writeJudgedStages(ctx: Pick<PrepContext, "files" | "log">, calibration: (StageTarget & { itemId: string })[], plans: PlanToJudge[], problems: string[], promptState: string) {
  const { files, log } = ctx;
  const prep = files.readPrepRecords();
  const arm = JUDGE_ARMS[0];
  const parsedAt = (key: string, sample: number) => {
    const record = finishedPrepRecord(prep, jobKey(stageJudgeCaseId(key), prepArmKey("judge", arm), promptState, sample));
    return record ? files.loadOutput(record) : undefined;
  };
  const judged = calibration.map((t) => {
    const parsed = [1, 2].map((sample) => parsedAt(t.key, sample));
    return { itemId: t.itemId, samples: parsed.map(stageVerdictFrom), evidence: parsed.map(stageEvidenceFrom) };
  });
  const score = scoreStageCalibration(STAGE_JUDGE_CALIBRATION, judged);
  const verdicts = plans.flatMap((p) => {
    const verdict = planVerdict(p, (key) => stageVerdictFrom(parsedAt(key, 1)));
    return verdict ? [verdict] : [];
  });
  const failures: StageFailure[] = verdicts
    .filter((v) => !v.passes)
    .map((v) => {
      const plan = plans.find((p) => p.outputId === v.outputId && p.armKey === v.armKey) as PlanToJudge;
      const evidence = plan.targets.map((t) => stageEvidenceFrom(parsedAt(t.key, 1))).filter((_, i) => stageVerdictFrom(parsedAt(plan.targets[i].key, 1)) === false);
      return { armKey: v.armKey, caseId: v.caseId, sample: v.sample, outputId: v.outputId, evidence: evidence.map((e) => `${e.evidence ?? ""} [stages: ${e.stages.join("; ")}]`).join(" | ") };
    });
  const readings = stageReadings(verdicts, referencesOf);
  const spentUsd = prep.filter((r) => r.caseId.startsWith(`judge-stage-`)).reduce((sum, r) => sum + r.costUsd, 0);
  const generatedAt = new Date();
  files.writeJudgedStages(renderStageJudge({ items: STAGE_JUDGE_CALIBRATION, calibration: score, judged, readings, failures, spentUsd, generatedAt, problems }), {
    generatedAt: generatedAt.toISOString(),
    promptState,
    promptVersion: STAGE_JUDGE_PROMPT_VERSION,
    calibration: score,
    judged,
    readings,
    verdicts,
    failures,
    problems,
    spentUsd,
  });
  log(`${score.check}: ${score.agree} of ${score.decided} agree (hand yes ${score.handPasses}, no ${score.handFails}), samples ${score.pairsAgree} of ${score.pairs}: ${score.reliable ? "reliable" : "not reliable"}`);
  for (const r of readings) log(`${r.armKey}: ${r.plans.hits} of ${r.plans.n} plans pass${r.vsReference && r.referenceKey ? `; against ${r.referenceKey} ${r.vsReference.arm.hits}/${r.vsReference.arm.n} vs ${r.vsReference.reference.hits}/${r.vsReference.reference.n}${r.vsReference.moved ? `, moved ${r.vsReference.moved}` : r.vsReference.beyondNoise ? ", beyond the noise, not moved" : ""}` : ""}`);
  log(`Stage judge calls so far $${spentUsd.toFixed(4)}. Wrote judged-stages.md and .json.`);
}
