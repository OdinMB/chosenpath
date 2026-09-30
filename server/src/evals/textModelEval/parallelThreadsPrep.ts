import type { SetOfBeatGenerationSchema, SwitchAnalysis, ThreadAnalysis } from "core/types/index.js";
import { repairBeatReply } from "../../game/services/beatRepairs.js";
import { checkSwitchPlan, checkThreadPlan } from "../../game/services/planChecks.js";
import { armKey, chainKey, PARALLEL_THREADS_CASES, PARALLEL_THREADS_PROMPT_STATE, type Stage } from "./arms.js";
import { caseStory, type EvalCase } from "./cases.js";
import { jobEstimateUsd, storyAfterAnalysis } from "./jobPlan.js";
import { JUDGE_ARMS, outputIdOf } from "./judgedChecks.js";
import { withEdits } from "./outcomeSettledPrep.js";
import { parallelThreadsCasesToFreeze } from "./parallelThreadsCases.js";
import {
  PLACES_CALIBRATION,
  PLACES_JUDGE_PROMPT_VERSION,
  contestDecidedAlone,
  lastStageOffers,
  oneSidedNames,
  placesEvidenceFrom,
  placesJudgeCaseId,
  placesJudgeJobs,
  placesJudgeRequest,
  placesVerdictFrom,
  renderPlacesJudge,
  scorePlacesCalibration,
  type ChapterPlanRow,
  type PlacesCalibrationItem,
  type PlacesFailure,
  type PlacesTarget,
  type SwitchPlanRow,
} from "./parallelThreadsJudge.js";
import { playthroughRunsFrom } from "./playthroughMode.js";
import { replayedTurn } from "./playthroughReplay.js";
import type { PlayRun } from "./playthroughs.js";
import { finishedPrepRecord, prepArmKey } from "./prepCalls.js";
import { finishedJobKeys, jobKey, keyOf, runJobs, usable, type CallRecord } from "./runner.js";
import { stageReadings, type JudgedPlan, type StageArmReading } from "./stageJudge.js";
import { spendBeside, type PrepContext } from "./turnPrep.js";
import { referenceKeyOf } from "./variantComparison.js";

/*
 * The parallel-threads stage's CLI modes (2026-10-01, fix 4 of the second
 * playthroughs' review), kept out of run.ts:
 * - --build-parallel-cases: the stage's switch and chapter cases from the
 *   second round's stored runs (parallelThreadsCases.ts), each only where its
 *   request is the one production sent there, frozen beside the others (those
 *   already frozen left as they are, unless --rebuild-cases); no calls;
 * - --judge-parallel: the stage's judged check, into prep-calls.jsonl, booked
 *   to the stage, then judged-parallel.md and .json: placesConsistent
 *   (parallelThreadsJudge.ts) on its calibration (two samples) and on every
 *   chain's turn of the stage's arms under adopted11 (one sample), one call per
 *   group turn, each read as the game keeps it (the chain's own plan checked
 *   and applied, the turn repaired); beside it the plans read by the game, no
 *   calls: each switch plan's offer of a contest at its last stage, and each
 *   chain's plan's one-sided contests and last stages settled by one side.
 */

const STAGE: Stage = "parallel-threads";
const CALIBRATION_SAMPLES = 2;
const PLAYTHROUGHS_2 = "playthroughs-2";

const lunaLow = (variant: "adopted" | "parallelThreads") => armKey({ model: "gpt-6-luna", reasoningEffort: "low" }, variant);

/** The stage's switch planner arms: production's and the variant's, on the group planner model. */
export const PARALLEL_SWITCH_ARMS = [lunaLow("adopted"), lunaLow("parallelThreads")];

/** The stage's chains: each side's chapter planner into its own group turn. */
export const PARALLEL_CHAINS = [chainKey(lunaLow("adopted"), lunaLow("adopted")), chainKey(lunaLow("parallelThreads"), lunaLow("parallelThreads"))];

const SWITCH_CASES = new Set<string>(PARALLEL_THREADS_CASES.switches);
const CHAPTER_CASES = new Set<string>(PARALLEL_THREADS_CASES.chapters);

type Lookup = { records: CallRecord[]; cases: EvalCase[]; load: (record: CallRecord) => unknown };

export type ParallelCalibrationTarget = PlacesTarget & { itemId: string };

/** The hand-read items' judge requests, each a stored group turn replayed (its edits applied), at two samples; and what could not be built. */
export function parallelCalibrationTargets(runs: PlayRun[], items: PlacesCalibrationItem[] = PLACES_CALIBRATION): { targets: ParallelCalibrationTarget[]; problems: string[] } {
  const problems: string[] = [];
  const targets: ParallelCalibrationTarget[] = [];
  for (const item of items) {
    try {
      const { before, played } = replayedTurn(runs, item.story, item.turn);
      const reply = played.reply ? withEdits(played.reply as SetOfBeatGenerationSchema, item.edits ?? []) : undefined;
      const request = reply ? placesJudgeRequest(before, reply) : undefined;
      if (!request) throw new Error(`turn ${item.turn} of ${item.story} is no group chapter step`);
      targets.push({ itemId: item.id, key: `cal-${item.id}`, request, samples: CALIBRATION_SAMPLES });
    } catch (error) {
      problems.push(`${item.id}: ${(error as Error).message}`);
    }
  }
  return { targets, problems };
}

/** The final usable record of a chain's step: its plan (1) or its turn (2). */
const chainStep = (records: CallRecord[], key: string, step: 1 | 2) => records.find((r) => r.jobKey === key && r.step === step && r.final && usable(r));

/** A chain's turn story (the case's story with the chain's own plan checked and applied) and its plan as written; undefined where either is missing. */
function chainStory(record: CallRecord, { records, cases, load }: Lookup) {
  const evalCase = cases.find((c) => c.id === record.caseId);
  const planRecord = chainStep(records, record.jobKey, 1);
  const plan = planRecord ? (load(planRecord) as ThreadAnalysis | undefined) : undefined;
  if (!evalCase?.state || !planRecord || !plan) return undefined;
  const before = caseStory(evalCase, false);
  return { before, plan, planRecord, story: storyAfterAnalysis(before, "thread", plan) };
}

/** One chain's turn of the stage's arms, with its judge call. */
export type ParallelReply = { armKey: string; caseId: string; sample: number; outputId: string; target: PlacesTarget };

/** Every chain's final usable turn of the stage's arms under its tag on its chapter cases, each read as the game keeps it. */
export function parallelRepliesToJudge(lookup: Lookup, chains: string[] = PARALLEL_CHAINS, promptState = PARALLEL_THREADS_PROMPT_STATE): ParallelReply[] {
  return lookup.records.flatMap((r): ParallelReply[] => {
    if (r.group !== "pipeline" || r.step !== 2 || !r.final || !usable(r) || !r.outputFile || r.promptState !== promptState || !chains.includes(r.armKey) || !CHAPTER_CASES.has(r.caseId)) return [];
    const chain = chainStory(r, lookup);
    const parsed = lookup.load(r) as SetOfBeatGenerationSchema | undefined;
    if (!chain || !parsed) return [];
    const request = placesJudgeRequest(chain.story, repairBeatReply(chain.story, parsed).reply);
    if (!request) return [];
    const outputId = outputIdOf(r.outputFile);
    return [{ armKey: r.armKey, caseId: r.caseId, sample: r.sample, outputId, target: { key: outputId, request, samples: 1 } }];
  });
}

/** The judge calls a run sends: every target, or with --cases (a smoke) the calibration items and replies named, by item id or case id. */
export function parallelTargetsToSend(calibration: ParallelCalibrationTarget[], replies: ParallelReply[], caseIds: string[] | undefined): PlacesTarget[] {
  const items = caseIds ? calibration.filter((t) => caseIds.includes(t.itemId)) : calibration;
  const read = caseIds ? replies.filter((r) => caseIds.includes(r.caseId)) : replies;
  return [...items.map(({ key, request, samples }) => ({ key, request, samples })), ...read.map((r) => r.target)];
}

/** Every switch plan of the stage's arms under its tag, as the game keeps it (the plan check's repairs), with how it offers a contest at its last stage. */
export function switchPlanRows({ records, cases, load }: Lookup, promptState = PARALLEL_THREADS_PROMPT_STATE): SwitchPlanRow[] {
  return records.flatMap((r): SwitchPlanRow[] => {
    if (r.group !== "switch" || !r.final || !usable(r) || !r.outputFile || r.promptState !== promptState || !PARALLEL_SWITCH_ARMS.includes(r.armKey) || !SWITCH_CASES.has(r.caseId)) return [];
    const evalCase = cases.find((c) => c.id === r.caseId);
    const plan = load(r) as SwitchAnalysis | undefined;
    if (!evalCase?.state || !plan) return [];
    const story = caseStory(evalCase, false);
    const checked = checkSwitchPlan(story, plan);
    return [{ armKey: r.armKey, caseId: r.caseId, sample: r.sample, outputId: outputIdOf(r.outputFile), offers: lastStageOffers(story, checked.problem === undefined ? checked.plan : plan) }];
  });
}

/** Every chain's plan of the stage's arms under its tag, as the game keeps it: its repairs, its one-sided contests' absent names, its last stages settled by one side. */
export function chapterPlanRows(lookup: Lookup, promptState = PARALLEL_THREADS_PROMPT_STATE): ChapterPlanRow[] {
  return lookup.records.flatMap((r): ChapterPlanRow[] => {
    if (r.group !== "pipeline" || r.step !== 1 || !r.final || !usable(r) || !r.outputFile || r.promptState !== promptState || !PARALLEL_CHAINS.includes(r.armKey) || !CHAPTER_CASES.has(r.caseId)) return [];
    const evalCase = lookup.cases.find((c) => c.id === r.caseId);
    const plan = lookup.load(r) as ThreadAnalysis | undefined;
    if (!evalCase?.state || !plan) return [];
    const story = caseStory(evalCase, false);
    const checked = checkThreadPlan(story, plan);
    const kept = checked.problem === undefined ? checked.plan : plan;
    return [
      {
        armKey: r.armKey,
        caseId: r.caseId,
        sample: r.sample,
        outputId: outputIdOf(r.outputFile),
        repairs: checked.repairs.filter((x) => !x.note).map((x) => x.kind),
        oneSided: oneSidedNames(story, kept),
        decidedAlone: contestDecidedAlone(story, kept),
      },
    ];
  });
}

const referencesOf = (key: string): string[] => [referenceKeyOf(key)].filter((k): k is string => typeof k === "string");

const asPlan = (row: { armKey: string; caseId: string; sample: number; outputId: string }, passes: boolean, threads: number): JudgedPlan => ({ armKey: row.armKey, caseId: row.caseId, sample: row.sample, outputId: row.outputId, passes, threads });

/** The plans' readings, the variant against production under the stop rule: each on the plans where it applies. */
export function parallelPlanReadings(switches: SwitchPlanRow[], chapters: ChapterPlanRow[]): { label: string; readings: StageArmReading[] }[] {
  return [
    { label: "Switches: a contest's last stage offered only as a grouped thread", readings: stageReadings(switches.filter((s) => s.offers.length).map((s) => asPlan(s, s.offers.every((o) => o.passes), s.offers.length)), referencesOf) },
    { label: "Chapters: a one-sided contest names no absent player", readings: stageReadings(chapters.filter((c) => c.oneSided.length).map((c) => asPlan(c, c.oneSided.every((o) => o.passes), c.oneSided.length)), referencesOf) },
    { label: "Chapters: no contest's last stage settled by one side alone", readings: stageReadings(chapters.map((c) => asPlan(c, c.decidedAlone.length === 0, c.decidedAlone.length)), referencesOf) },
  ];
}

/** The judged readings: each chain against its reference chain, production's. */
export function parallelReadings(verdicts: JudgedPlan[]): StageArmReading[] {
  return stageReadings(verdicts, referencesOf);
}

const runsOf = (ctx: Pick<PrepContext, "files">): PlayRun[] => playthroughRunsFrom(ctx.files.readPlaythroughs(PLAYTHROUGHS_2));

/** The prompt hash each stored playthrough call sent, by its output file. */
const promptHashesOf = (ctx: Pick<PrepContext, "files">) => {
  const byId = new Map(ctx.files.readPrepRecords().flatMap((r) => (r.outputFile && r.promptHash ? [[outputIdOf(r.outputFile), r.promptHash] as [string, string]] : [])));
  return (outputFile: string) => byId.get(outputIdOf(outputFile));
};

// --- --build-parallel-cases ---

export function buildParallelCasesMode(ctx: Pick<PrepContext, "files" | "log">, replace: boolean): void {
  const { files, log } = ctx;
  if (!files.casesExist()) throw new Error("No frozen cases. Run --build-cases first.");
  const runs = runsOf(ctx);
  if (runs.length === 0) throw new Error("No stored second-round playthroughs (playthroughs-2.json). Run --playthroughs --round 2 first.");
  const { cases, problems, skipped } = parallelThreadsCasesToFreeze(files.readCases(), runs, promptHashesOf(ctx), replace);
  if (problems.length) throw new Error(problems.join("; "));
  if (skipped.length) log(`Already frozen, left as they are: ${skipped.join(", ")}.`);
  if (cases.length === 0) return log("Nothing new to freeze; no calls.");
  files.addCases(cases, undefined, replace);
  log(`Froze ${cases.map((c) => c.id).join(", ")} beside the other cases; no calls.`);
}

// --- --judge-parallel ---

export async function judgeParallelMode(ctx: PrepContext, options: { caseIds?: string[] } = {}): Promise<void> {
  const { files, log } = ctx;
  const runs = runsOf(ctx);
  const lookup = { records: files.readRecords(), cases: files.readCases(), load: files.loadOutput };
  const { targets: calibration, problems } = parallelCalibrationTargets(runs);
  const replies = parallelRepliesToJudge(lookup);
  const targets = parallelTargetsToSend(calibration, replies, options.caseIds);
  const arm = JUDGE_ARMS[0];
  const jobs = placesJudgeJobs(targets, arm, PARALLEL_THREADS_PROMPT_STATE, STAGE);
  const done = finishedJobKeys(files.readPrepRecords());
  const open = jobs.filter((j) => !done.has(keyOf(j)));
  const estimate = open.reduce((sum, j) => sum + jobEstimateUsd(j), 0);
  ctx.refuse(STAGE, estimate);
  log(`${calibration.length} calibration items, ${replies.length} chain turns of the stage's arms on ${arm.key} (stage ${STAGE}): ${jobs.length} calls, ${open.length} open, est $${estimate.toFixed(3)}`);
  const result = await runJobs(jobs, ctx.deps("prep"), { caps: ctx.caps, previous: files.readPrepRecords(), extraSpend: spendBeside(files, "prep"), tokensPerMinute: ctx.tpm, maxInFlight: ctx.maxInFlight });
  if (result.stoppedReason) log(`Stopped: ${result.stoppedReason}`);
  writeJudgedParallel(ctx, calibration, replies, problems, lookup);
}

/** judged-parallel.md and .json from every judge call so far and the stage's plans; no calls. */
export function writeJudgedParallel(ctx: Pick<PrepContext, "files" | "log">, calibration: ParallelCalibrationTarget[], replies: ParallelReply[], problems: string[], lookup: Lookup): void {
  const { files, log } = ctx;
  const prep = files.readPrepRecords();
  const arm = JUDGE_ARMS[0];
  const parsedAt = (key: string, sample: number) => {
    const record = finishedPrepRecord(prep, jobKey(placesJudgeCaseId(key), prepArmKey("judge", arm), PARALLEL_THREADS_PROMPT_STATE, sample));
    return record ? files.loadOutput(record) : undefined;
  };
  const judged = calibration.map((t) => {
    const parsed = [1, 2].map((sample) => parsedAt(t.key, sample));
    return { itemId: t.itemId, samples: parsed.map(placesVerdictFrom), evidence: parsed.map(placesEvidenceFrom) };
  });
  const verdicts = replies.flatMap((r): JudgedPlan[] => {
    const passes = placesVerdictFrom(parsedAt(r.target.key, 1));
    return passes === undefined ? [] : [{ armKey: r.armKey, caseId: r.caseId, sample: r.sample, outputId: r.outputId, passes, threads: 1 }];
  });
  const failures: PlacesFailure[] = replies.flatMap((r) => {
    const parsed = parsedAt(r.target.key, 1);
    if (placesVerdictFrom(parsed) !== false) return [];
    const said = placesEvidenceFrom(parsed);
    return [{ armKey: r.armKey, caseId: r.caseId, sample: r.sample, outputId: r.outputId, evidence: `${said.evidence ?? ""} [${said.lines.join("; ")}]` }];
  });
  const switches = switchPlanRows(lookup);
  const chapters = chapterPlanRows(lookup);
  const calibrationReading = scorePlacesCalibration(PLACES_CALIBRATION, judged);
  const report = {
    calibration: calibrationReading,
    items: PLACES_CALIBRATION,
    judged,
    readings: parallelReadings(verdicts),
    failures,
    plans: { switches, chapters, readings: parallelPlanReadings(switches, chapters) },
  };
  const spentUsd = prep.filter((r) => r.stage === STAGE).reduce((sum, r) => sum + r.costUsd, 0);
  const generatedAt = new Date();
  files.writeJudgedParallel(renderPlacesJudge({ report, spentUsd, generatedAt, problems }), {
    generatedAt: generatedAt.toISOString(),
    promptState: PARALLEL_THREADS_PROMPT_STATE,
    promptVersion: PLACES_JUDGE_PROMPT_VERSION,
    report,
    verdicts,
    problems,
    spentUsd,
  });
  const c = calibrationReading;
  log(`placesConsistent: ${c.agree} of ${c.decided} agree (hand yes ${c.handPasses}, no ${c.handFails}), samples ${c.pairsAgree} of ${c.pairs}: ${c.reliable ? "reliable" : "not reliable"}`);
  for (const r of report.readings) log(`  ${r.armKey}: ${r.plans.hits} of ${r.plans.n} pass${r.vsReference && r.referenceKey ? `; against production ${r.vsReference.arm.hits}/${r.vsReference.arm.n} vs ${r.vsReference.reference.hits}/${r.vsReference.reference.n}${r.vsReference.moved ? `, moved ${r.vsReference.moved}` : r.vsReference.beyondNoise ? ", beyond the noise, not moved" : ""}` : ""}`);
  for (const group of report.plans.readings) {
    for (const r of group.readings) log(`  ${group.label}: ${r.armKey} ${r.plans.hits} of ${r.plans.n}${r.vsReference?.moved ? `, moved ${r.vsReference.moved}` : ""}`);
  }
  log(`The stage's judge calls so far $${spentUsd.toFixed(4)}. Wrote judged-parallel.md and .json.`);
}
