import type { Story } from "core/models/Story.js";
import type { SetOfBeatGenerationSchema, ThreadAnalysis } from "core/types/index.js";
import { repairBeatReply } from "../../game/services/beatRepairs.js";
import { checkThreadPlan } from "../../game/services/planChecks.js";
import { sceneOf } from "../../game/services/storyTextRounds/sharedScenes.js";
import { armKey, chainKey, PARALLEL_THREADS_PROMPT_STATE, SCENES_CASES, SCENES_PROMPT_STATE, type Stage } from "./arms.js";
import { caseStory, type EvalCase } from "./cases.js";
import { asCall, checkedTurns, type CheckedTurn } from "./checkedTurns.js";
import { jobEstimateUsd, storyAfterAnalysis } from "./jobPlan.js";
import { JUDGE_ARMS, outputIdOf } from "./judgedChecks.js";
import { checksForRecords } from "./outputChecks.js";
import {
  PLACES_CALIBRATION,
  PLACES_JUDGE_PROMPT_VERSION,
  placesEvidenceFrom,
  placesJudgeCaseId,
  placesJudgeJobs,
  placesJudgeRequest,
  placesVerdictFrom,
  scorePlacesCalibration,
  type PlacesAgreement,
  type PlacesCalibrationItem,
  type PlacesTarget,
} from "./parallelThreadsJudge.js";
import { playthroughRunsFrom } from "./playthroughMode.js";
import { replayedTurn } from "./playthroughReplay.js";
import type { PlayRun } from "./playthroughs.js";
import { finishedPrepRecord, prepArmKey } from "./prepCalls.js";
import { renderVariantComparison } from "./resultsReport.js";
import { finishedJobKeys, jobKey, keyOf, runJobs, usable, type CallRecord } from "./runner.js";
import { sharedScenesCasesToFreeze } from "./sharedScenesCases.js";
import { stageReadings, type JudgedPlan, type StageArmReading, type StageComparison } from "./stageJudge.js";
import { spendBeside, type PrepContext } from "./turnPrep.js";
import { renderTurnWaits, turnKindOf, turnWaitReadings, type TurnKind, type TurnWait } from "./turnWaits.js";
import { referenceKeyOf, variantComparisons, type VariantComparison } from "./variantComparison.js";

/*
 * The scenes stage's CLI modes (decision A's retest of the parallel-thread
 * lines, the evening of 2026-10-01), kept out of run.ts:
 * - --build-scenes-cases: the stage's chapter openings and chapter steps from
 *   the third round's stored runs (sharedScenesCases.ts), each only where its
 *   request is the one production sent there, frozen beside the others (those
 *   already frozen left as they are, unless --rebuild-cases); no calls;
 * - --judge-scenes: the stage's judged check, into prep-calls.jsonl, booked to
 *   the stage, then judged-scenes.md and .json: placesConsistent
 *   (parallelThreadsJudge.ts, prompt v2 as fix 4 calibrated it) on round 3's
 *   hand-read items (two samples; round 2's items read from their stored
 *   verdicts under adopted11) and once on every turn of the stage's arms under
 *   adopted24, each read as the game keeps it: a chain's turn on the story its
 *   own plan made (checked and applied), a chapter step's kept reply (production's
 *   checked retry in the loop), both after the beat repairs. Beside it, the
 *   chains' plans read by the game (no calls): each thread's scene, and the
 *   players of other threads its steps and results name; the variant against
 *   production per kind and pooled under the stop rule; the chapter steps'
 *   retries, waits, cost and automatic checks.
 */

const STAGE: Stage = "scenes";
const CALIBRATION_SAMPLES = 2;
const PLAYTHROUGHS_3 = "playthroughs-3";

const lunaLow = (variant: "adopted" | "sharedScenes" | "sharedScenesB") => armKey({ model: "gpt-6-luna", reasoningEffort: "low" }, variant);

/** The stage's turn arms: production's group turn and the variant's, on the group turn model. */
export const SCENES_ARMS = [lunaLow("adopted"), lunaLow("sharedScenes")];

/** The stage's chains: each side's chapter planner into its own group turn; the fix-and-retest's third. */
export const SCENES_CHAINS = [
  chainKey(lunaLow("adopted"), lunaLow("adopted")),
  chainKey(lunaLow("sharedScenes"), lunaLow("sharedScenes")),
  chainKey(lunaLow("sharedScenesB"), lunaLow("sharedScenesB")),
];

const CHAIN_CASES = new Set<string>(SCENES_CASES.chains);
const TURN_CASES = new Set<string>(SCENES_CASES.turns);

/**
 * Round 3's group chapter steps read by hand on the check's criterion (prompt
 * v2: everyone, every group, vehicle and object in one place at a time; a
 * shared place or vehicle in one place and state in every text; separate
 * scenes may share a place), on the story pages before any judge call
 * (2026-10-01, evening). Yes and no from all three group stories; one partial
 * left out of agreement, as round 2's galley table at turn 23 was.
 */
export const PLACES_CALIBRATION_R3: PlacesCalibrationItem[] = [
  // --- Hand no ---
  { id: "r3-estate-agents-t6", story: "play-estate-agents", turn: 6, hand: false, note: "Rory carries the lanterns back into the conservatory in his own text; in Tamsin's he sits across from her at the Amber Cup on the quay" },
  { id: "r3-estate-agents-t7", story: "play-estate-agents", turn: 7, hand: false, note: "The same, one step on: Rory clears the conservatory's staging in his text, and turns a menu holder at the Amber Cup's table in Tamsin's" },
  { id: "r3-estate-agents-t10", story: "play-estate-agents", turn: 10, hand: false, note: "Tamsin at the Amber Cup with Rory in his text; in her own at the conservatory table with the buyer and Mara over the account" },
  { id: "r3-estate-agents-t17", story: "play-estate-agents", turn: 17, hand: false, note: "The buyer beside Rory at the nursery threshold in his text; standing at Noor's plan table in the conservatory in Tamsin's" },
  { id: "r3-food-trucks-t13", story: "play-food-trucks", turn: 13, hand: false, note: "Omar's crew laying out his plate across the showcase's inspection lane in Amara's text; Omar seated by the loaded truck with Jo and his crew in the yard in his own" },
  { id: "r3-food-trucks-t15", story: "play-food-trucks", turn: 15, hand: false, note: "Omar's station ready across the bay and Mara addressing both finalists in Amara's text; Omar and his crew at the loaded rig with Jo in the workshop in his own" },
  { id: "r3-space-pirates-t6", story: "play-space-pirates", turn: 6, hand: false, note: "Oren joins Tomas and Davi at the chart table in his text; Davi crouches at the auxiliary engine's service panel in his own" },
  // --- Hand yes ---
  { id: "r3-food-trucks-t6", story: "play-food-trucks", turn: 6, hand: true, note: "Amara in the Tilt Market community kitchen's loading bay with the regulars; Omar at Echo Quay's tasting counter with his crew" },
  { id: "r3-food-trucks-t7", story: "play-food-trucks", turn: 7, hand: true, note: "The same two places one step on; the regulars only in Amara's scene, the crew and the judge only in Omar's" },
  { id: "r3-food-trucks-t9", story: "play-food-trucks", turn: 9, hand: true, note: "Amara at the community kitchen's evening line; Omar at the prep table with his crew over the route and the atlas" },
  { id: "r3-food-trucks-t10", story: "play-food-trucks", turn: 10, hand: true, note: "The same two places one step on; a runner brings Omar's crew the route notice" },
  { id: "r3-space-pirates-t16", story: "play-space-pirates", turn: 16, hand: true, note: "Tomas at the bridge chart table with Ves and the crew; Davi at the engineering bench, the creditor's representative on the console; Oren with the guild contact at Glasswake's moon-glass window" },
  // --- Partial, left out of agreement ---
  { id: "r3-estate-agents-t13", story: "play-estate-agents", turn: 13, hand: "partial", note: "Rory and Mara at the conservatory table, Tamsin and Noor with the plan in the same conservatory, neither text showing the other; the buyer at the doorway in both" },
];

export type ScenesCalibrationTarget = PlacesTarget & { itemId: string };

/** Round 3's hand-read items' judge requests, each a stored group turn replayed, at two samples; and what could not be built. */
export function scenesCalibrationTargets(runs: PlayRun[], items: PlacesCalibrationItem[] = PLACES_CALIBRATION_R3): { targets: ScenesCalibrationTarget[]; problems: string[] } {
  const problems: string[] = [];
  const targets: ScenesCalibrationTarget[] = [];
  for (const item of items) {
    try {
      const { before, played } = replayedTurn(runs, item.story, item.turn);
      const request = played.reply ? placesJudgeRequest(before, played.reply as SetOfBeatGenerationSchema) : undefined;
      if (!request) throw new Error(`turn ${item.turn} of ${item.story} is no group chapter step`);
      targets.push({ itemId: item.id, key: `scenes-cal-${item.id}`, request, samples: CALIBRATION_SAMPLES });
    } catch (error) {
      problems.push(`${item.id}: ${(error as Error).message}`);
    }
  }
  return { targets, problems };
}

type Lookup = { records: CallRecord[]; cases: EvalCase[]; load: (record: CallRecord) => unknown };

/** One turn of the stage's arms to judge: a chain's turn or a chapter step's kept reply. */
export type ScenesReply = { kind: "chain" | "turn"; armKey: string; caseId: string; sample: number; outputId: string; target: PlacesTarget };

/** The final usable record of a chain's step: its plan (1) or its turn (2). */
const chainStep = (records: CallRecord[], key: string, step: 1 | 2) => records.find((r) => r.jobKey === key && r.step === step && r.final && usable(r));

/** Every chain's final usable turn on the story its own plan made, then every chapter step's kept reply, of the stage's arms under its tag. */
export function scenesRepliesToJudge(lookup: Lookup, turns: CheckedTurn[], promptState = SCENES_PROMPT_STATE): ScenesReply[] {
  const byId = new Map(lookup.cases.map((c) => [c.id, c]));
  const chains = lookup.records.flatMap((r): ScenesReply[] => {
    if (r.group !== "pipeline" || r.step !== 2 || !r.final || !usable(r) || !r.outputFile || r.promptState !== promptState || !SCENES_CHAINS.includes(r.armKey) || !CHAIN_CASES.has(r.caseId)) return [];
    const evalCase = byId.get(r.caseId);
    const planRecord = chainStep(lookup.records, r.jobKey, 1);
    const plan = planRecord ? (lookup.load(planRecord) as ThreadAnalysis | undefined) : undefined;
    const parsed = lookup.load(r) as SetOfBeatGenerationSchema | undefined;
    if (!evalCase?.state || !plan || !parsed) return [];
    const story = storyAfterAnalysis(caseStory(evalCase, false), "thread", plan);
    const request = placesJudgeRequest(story, repairBeatReply(story, parsed).reply);
    if (!request) return [];
    const outputId = outputIdOf(r.outputFile);
    return [{ kind: "chain", armKey: r.armKey, caseId: r.caseId, sample: r.sample, outputId, target: { key: outputId, request, samples: 1 } }];
  });
  const steps = turns.flatMap((t): ScenesReply[] => {
    if (t.promptState !== promptState || !SCENES_ARMS.includes(t.armKey) || !TURN_CASES.has(t.caseId)) return [];
    const kept = t.kept === 2 ? t.retry : t.kept === 1 ? t.first : undefined;
    const evalCase = byId.get(t.caseId);
    const parsed = kept ? (lookup.load(kept) as SetOfBeatGenerationSchema | undefined) : undefined;
    if (!kept?.outputFile || !evalCase?.state || !parsed) return [];
    const story = caseStory(evalCase);
    const request = placesJudgeRequest(story, repairBeatReply(story, parsed).reply);
    if (!request) return [];
    const outputId = outputIdOf(kept.outputFile);
    return [{ kind: "turn", armKey: t.armKey, caseId: t.caseId, sample: t.sample, outputId, target: { key: outputId, request, samples: 1 } }];
  });
  return [...chains, ...steps];
}

/** The judge calls a run sends: every target, or with --cases (a smoke) the calibration items and replies named, by item id or case id. */
export function scenesTargetsToSend(calibration: ScenesCalibrationTarget[], replies: ScenesReply[], caseIds: string[] | undefined): PlacesTarget[] {
  const items = caseIds ? calibration.filter((t) => caseIds.includes(t.itemId)) : calibration;
  const read = caseIds ? replies.filter((r) => caseIds.includes(r.caseId)) : replies;
  return [...items.map(({ key, request, samples }) => ({ key, request, samples })), ...read.map((r) => r.target)];
}

// ---------------------------------------------------------------- the plans

const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Whether a text names a character: the full name, or its first word as a word. */
function names(text: string, name: string): boolean {
  const first = name.split(/\s+/)[0];
  return text.includes(name) || (first.length > 1 && new RegExp(`(^|[^\\p{L}])${escaped(first)}(?![\\p{L}])`, "u").test(text));
}

type Loose = Record<string, unknown>;
const asObject = (value: unknown): Loose => (value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Loose) : {});
const asString = (value: unknown): string => (typeof value === "string" ? value : "");

export type ThreadNames = { threadId: string; names: string[] };

/** A chain's plan as the game keeps it: its threads, those with a scene, the other threads' players its steps and results name (a proxy for a player planned into another thread's scene), and those its scene names. */
export type ScenesPlanRow = { armKey: string; caseId: string; sample: number; outputId: string; threads: number; scenes: number; namesOtherPlayers: ThreadNames[]; sceneNamesOtherPlayers: ThreadNames[]; sceneTexts: string[] };

/** The other players' names a thread's question, steps, results and milestones name. */
function otherPlayersNamed(story: Story, thread: ThreadAnalysis["threads"][number], text: string): string[] {
  const own = new Set([...(thread.playersSideA ?? []), ...(thread.playersSideB ?? [])]);
  return story
    .getPlayerSlots()
    .filter((slot) => !own.has(slot))
    .map((slot) => story.getPlayer(slot)?.name ?? slot)
    .filter((name) => names(text, name));
}

const planTexts = (thread: ThreadAnalysis["threads"][number]) =>
  [
    asString((thread as unknown as Loose).question),
    ...Object.values(asObject(thread.possibleMilestones)).map(asString),
    ...(thread.progression ?? []).flatMap((step) => [asString(step.question), ...Object.values(asObject(step.possibleResolutions)).map(asString)]),
  ].join("\n");

/** Every chain's plan of the stage's arms under its tag, as the game keeps it (the plan check's repairs). */
export function scenesChainPlanRows(lookup: Lookup, promptState = SCENES_PROMPT_STATE): ScenesPlanRow[] {
  return lookup.records.flatMap((r): ScenesPlanRow[] => {
    if (r.group !== "pipeline" || r.step !== 1 || !r.final || !usable(r) || !r.outputFile || r.promptState !== promptState || !SCENES_CHAINS.includes(r.armKey) || !CHAIN_CASES.has(r.caseId)) return [];
    const evalCase = lookup.cases.find((c) => c.id === r.caseId);
    const plan = lookup.load(r) as ThreadAnalysis | undefined;
    if (!evalCase?.state || !plan) return [];
    const story = caseStory(evalCase, false);
    const checked = checkThreadPlan(story, plan);
    const kept = checked.problem === undefined ? checked.plan : plan;
    const threads = kept.threads ?? [];
    const scenes = threads.map((t) => sceneOf(t));
    return [
      {
        armKey: r.armKey,
        caseId: r.caseId,
        sample: r.sample,
        outputId: outputIdOf(r.outputFile),
        threads: threads.length,
        scenes: scenes.filter(Boolean).length,
        namesOtherPlayers: threads.flatMap((t) => {
          const found = otherPlayersNamed(story, t, planTexts(t));
          return found.length ? [{ threadId: t.id, names: found }] : [];
        }),
        sceneNamesOtherPlayers: threads.flatMap((t, i) => {
          const found = scenes[i] ? otherPlayersNamed(story, t, scenes[i] ?? "") : [];
          return found.length ? [{ threadId: t.id, names: found }] : [];
        }),
        sceneTexts: threads.map((t, i) => `${t.id}: ${scenes[i] ?? "–"}`),
      },
    ];
  });
}

const referencesOf = (key: string): string[] => [referenceKeyOf(key)].filter((k): k is string => typeof k === "string");

/** The plans' reading, the variant against production under the stop rule. */
export function scenesPlanReadings(rows: ScenesPlanRow[]): { label: string; readings: StageArmReading[] }[] {
  const plans = rows.map((r): JudgedPlan => ({ armKey: r.armKey, caseId: r.caseId, sample: r.sample, outputId: r.outputId, passes: r.namesOtherPlayers.length === 0, threads: r.threads }));
  return [{ label: "Chapter plans: no thread's steps or results name a player of another thread", readings: stageReadings(plans, referencesOf) }];
}

// ---------------------------------------------------------------- the readings

export type ScenesVerdict = { kind: "chain" | "turn"; armKey: string; caseId: string; sample: number; outputId: string; passes: boolean };

const FAMILY: Record<string, string> = {
  [SCENES_ARMS[0]]: "production",
  [SCENES_CHAINS[0]]: "production",
  [SCENES_ARMS[1]]: "sharedScenes",
  [SCENES_CHAINS[1]]: "sharedScenes",
};

const asPlan = (v: ScenesVerdict, armKey = v.armKey): JudgedPlan => ({ armKey, caseId: v.caseId, sample: v.sample, outputId: v.outputId, passes: v.passes, threads: 1 });

/** placesConsistent per kind (each variant against its production) and pooled (the variant's turns against production's), under the stop rule. */
export function scenesReadings(verdicts: ScenesVerdict[]): { label: string; readings: StageArmReading[] }[] {
  const pooled = verdicts.flatMap((v) => (FAMILY[v.armKey] ? [asPlan(v, FAMILY[v.armKey])] : []));
  return [
    { label: "Chains (the chapter planner, then its group turn)", readings: stageReadings(verdicts.filter((v) => v.kind === "chain").map((v) => asPlan(v)), referencesOf) },
    { label: "Chapter steps on the plans the round stored", readings: stageReadings(verdicts.filter((v) => v.kind === "turn").map((v) => asPlan(v)), referencesOf) },
    { label: "Chains and chapter steps pooled", readings: stageReadings(pooled, (key) => (key === "sharedScenes" ? ["production"] : [])) },
  ];
}

/** The calibration: round 3's items alone, and with round 2's (fix 4's calibration, read from its stored verdicts). */
export function scenesCalibration(round3: { itemId: string; samples: (boolean | undefined)[] }[], round2: { itemId: string; samples: (boolean | undefined)[] }[]): { round3: PlacesAgreement; both: PlacesAgreement } {
  return { round3: scorePlacesCalibration(PLACES_CALIBRATION_R3, round3), both: scorePlacesCalibration([...PLACES_CALIBRATION, ...PLACES_CALIBRATION_R3], [...round2, ...round3]) };
}

// ---------------------------------------------------------------- the modes

const runsOf = (ctx: Pick<PrepContext, "files">): PlayRun[] => playthroughRunsFrom(ctx.files.readPlaythroughs(PLAYTHROUGHS_3));

/** The prompt hash each stored playthrough call sent, by its output file. */
const promptHashesOf = (ctx: Pick<PrepContext, "files">) => {
  const byId = new Map(ctx.files.readPrepRecords().flatMap((r) => (r.outputFile && r.promptHash ? [[outputIdOf(r.outputFile), r.promptHash] as [string, string]] : [])));
  return (outputFile: string) => byId.get(outputIdOf(outputFile));
};

export function buildScenesCasesMode(ctx: Pick<PrepContext, "files" | "log">, replace: boolean): void {
  const { files, log } = ctx;
  if (!files.casesExist()) throw new Error("No frozen cases. Run --build-cases first.");
  const runs = runsOf(ctx);
  if (runs.length === 0) throw new Error("No stored third-round playthroughs (playthroughs-3.json). Run --playthroughs --round 3 first.");
  const { cases, problems, skipped } = sharedScenesCasesToFreeze(files.readCases(), runs, promptHashesOf(ctx), replace);
  if (problems.length) throw new Error(problems.join("; "));
  if (skipped.length) log(`Already frozen, left as they are: ${skipped.join(", ")}.`);
  if (cases.length === 0) return log("Nothing new to freeze; no calls.");
  files.addCases(cases, undefined, replace);
  log(`Froze ${cases.map((c) => c.id).join(", ")} beside the other cases; no calls.`);
}

/** The stage's turn records (the chapter steps, production's checked retry in the loop), read whole. */
async function stageTurns(ctx: Pick<PrepContext, "files">, cases: EvalCase[]): Promise<{ records: CallRecord[]; turns: CheckedTurn[] }> {
  const armKeys = new Set(SCENES_ARMS);
  const records = ctx.files.readRecords().filter((r) => r.stage === STAGE && r.promptState === SCENES_PROMPT_STATE && armKeys.has(r.armKey) && r.group === "beat");
  const byId = new Map(cases.map((c) => [c.id, c]));
  const turns = await checkedTurns(records, ctx.files.loadOutput, (id) => byId.get(id)?.tags.ending === true);
  return { records, turns };
}

export async function judgeScenesMode(ctx: PrepContext, options: { caseIds?: string[] } = {}): Promise<void> {
  const { files, log } = ctx;
  const runs = runsOf(ctx);
  const cases = files.readCases();
  const lookup = { records: files.readRecords(), cases, load: files.loadOutput };
  const { turns } = await stageTurns(ctx, cases);
  const { targets: calibration, problems } = scenesCalibrationTargets(runs);
  const replies = scenesRepliesToJudge(lookup, turns);
  const targets = scenesTargetsToSend(calibration, replies, options.caseIds);
  const arm = JUDGE_ARMS[0];
  const jobs = placesJudgeJobs(targets, arm, SCENES_PROMPT_STATE, STAGE);
  const done = finishedJobKeys(files.readPrepRecords());
  const open = jobs.filter((j) => !done.has(keyOf(j)));
  const estimate = open.reduce((sum, j) => sum + jobEstimateUsd(j), 0);
  ctx.refuse(STAGE, estimate);
  log(`${calibration.length} round-3 calibration items, ${replies.length} turns of the stage's arms on ${arm.key} (stage ${STAGE}): ${jobs.length} calls, ${open.length} open, est $${estimate.toFixed(3)}`);
  const result = await runJobs(jobs, ctx.deps("prep"), { caps: ctx.caps, previous: files.readPrepRecords(), extraSpend: spendBeside(files, "prep"), tokensPerMinute: ctx.tpm, maxInFlight: ctx.maxInFlight });
  if (result.stoppedReason) log(`Stopped: ${result.stoppedReason}`);
  await writeJudgedScenes(ctx, problems);
}

type ArmTally = { armKey: string; jobs: number; retried: number; failed: number; meanWaitS: number; costUsd: number };

/** judged-scenes.md and .json from every judge call so far, the stage's plans and turns; no calls. */
export async function writeJudgedScenes(ctx: Pick<PrepContext, "files" | "log">, problems: string[] = []): Promise<void> {
  const { files, log } = ctx;
  const cases = files.readCases();
  const allRecords = files.readRecords();
  const lookup = { records: allRecords, cases, load: files.loadOutput };
  const { records: turnRecords, turns } = await stageTurns(ctx, cases);
  const replies = scenesRepliesToJudge(lookup, turns);
  const prep = files.readPrepRecords();
  const arm = JUDGE_ARMS[0];
  const parsedAt = (key: string, sample: number, promptState = SCENES_PROMPT_STATE) => {
    const record = finishedPrepRecord(prep, jobKey(placesJudgeCaseId(key), prepArmKey("judge", arm), promptState, sample));
    return record ? files.loadOutput(record) : undefined;
  };
  const judgedOf = (items: PlacesCalibrationItem[], keyOf: (id: string) => string, promptState: string) =>
    items.map((item) => {
      const parsed = [1, 2].map((sample) => parsedAt(keyOf(item.id), sample, promptState));
      return { itemId: item.id, samples: parsed.map(placesVerdictFrom), evidence: parsed.map(placesEvidenceFrom) };
    });
  const round3 = judgedOf(PLACES_CALIBRATION_R3, (id) => `scenes-cal-${id}`, SCENES_PROMPT_STATE);
  const round2 = judgedOf(PLACES_CALIBRATION, (id) => `cal-${id}`, PARALLEL_THREADS_PROMPT_STATE);
  const calibration = scenesCalibration(round3, round2);
  const judged = replies.map((r) => {
    const parsed = parsedAt(r.target.key, 1);
    return { ...r, passes: placesVerdictFrom(parsed), said: placesEvidenceFrom(parsed) };
  });
  const verdicts: ScenesVerdict[] = judged.flatMap((j) => (j.passes === undefined ? [] : [{ kind: j.kind, armKey: j.armKey, caseId: j.caseId, sample: j.sample, outputId: j.outputId, passes: j.passes }]));
  const planRows = scenesChainPlanRows(lookup);
  const readings = scenesReadings(verdicts);
  const planReadings = scenesPlanReadings(planRows);
  // The chapter steps: retries, waits and cost per arm, and the automatic checks on the replies the game keeps
  const kinds = new Map(cases.flatMap((c): [string, TurnKind][] => (TURN_CASES.has(c.id) ? [[c.id, turnKindOf(c) ?? "chapter step"]] : [])));
  const keptCalls = turns.map((t) => asCall(t, "kept")).filter((r): r is CallRecord => r !== undefined);
  const { checks } = checksForRecords(turnRecords, cases, files.loadOutput, files.loadReplyContent, files.loadPrompt);
  const tags = new Map(cases.map((c) => [c.id, c.tags]));
  const keptComparisons = variantComparisons(keptCalls, checks, tags, SCENES_PROMPT_STATE);
  const waits = turnWaitReadings(keptCalls, kinds);
  const turnTallies: ArmTally[] = SCENES_ARMS.map((key) => {
    const own = turns.filter((t) => t.armKey === key);
    return { armKey: key, jobs: own.length, retried: own.filter((t) => t.retried).length, failed: own.filter((t) => !t.kept).length, meanWaitS: own.length ? own.reduce((s, t) => s + t.waitMs, 0) / own.length / 1000 : 0, costUsd: own.reduce((s, t) => s + t.costUsd, 0) };
  });
  const chainRecords = allRecords.filter((r) => r.stage === STAGE && r.promptState === SCENES_PROMPT_STATE && r.group === "pipeline");
  const chainTallies: ArmTally[] = SCENES_CHAINS.map((key) => {
    const finals = chainRecords.filter((r) => r.armKey === key && r.final);
    const jobs = new Set(finals.map((r) => r.jobKey));
    const waitOf = (job: string) => finals.filter((r) => r.jobKey === job).reduce((s, r) => s + r.latencyMs, 0);
    return {
      armKey: key,
      jobs: jobs.size,
      retried: 0,
      failed: [...jobs].filter((job) => !finals.some((r) => r.jobKey === job && r.step === 2 && usable(r))).length,
      meanWaitS: jobs.size ? [...jobs].reduce((s, job) => s + waitOf(job), 0) / jobs.size / 1000 : 0,
      costUsd: chainRecords.filter((r) => r.armKey === key).reduce((s, r) => s + r.costUsd, 0),
    };
  });
  const spentUsd = prep.filter((r) => r.stage === STAGE).reduce((sum, r) => sum + r.costUsd, 0);
  const callsUsd = allRecords.filter((r) => r.stage === STAGE).reduce((sum, r) => sum + r.costUsd, 0);
  const generatedAt = new Date();
  const report: ScenesReport = { generatedAt, calibration, round3, round2, readings, planReadings, planRows, judged, turnTallies, chainTallies, keptComparisons, waits, spentUsd, callsUsd, problems };
  files.writeJudgedScenes(renderJudgedScenes(report), {
    generatedAt: generatedAt.toISOString(),
    promptState: SCENES_PROMPT_STATE,
    promptVersion: PLACES_JUDGE_PROMPT_VERSION,
    calibration,
    round3,
    readings,
    planReadings,
    planRows,
    judged: judged.map((j) => ({ kind: j.kind, armKey: j.armKey, caseId: j.caseId, sample: j.sample, outputId: j.outputId, passes: j.passes, said: j.said })),
    turnTallies,
    chainTallies,
    spentUsd,
    callsUsd,
    problems,
  });
  const c = calibration.both;
  log(`placesConsistent with round 3's items: ${c.agree} of ${c.decided} agree (hand yes ${c.handPasses}, no ${c.handFails}), samples ${c.pairsAgree} of ${c.pairs}: ${c.reliable ? "reliable" : "not reliable"}; round 3 alone ${calibration.round3.agree} of ${calibration.round3.decided}`);
  for (const group of [...readings, ...planReadings]) {
    for (const r of group.readings) log(`  ${group.label}: ${r.armKey} ${r.plans.hits} of ${r.plans.n}${r.vsReference ? `; against ${r.referenceKey} ${r.vsReference.arm.hits}/${r.vsReference.arm.n} vs ${r.vsReference.reference.hits}/${r.vsReference.reference.n}, ${readingText(r.vsReference)}` : ""}`);
  }
  log(`The stage's judge calls so far $${spentUsd.toFixed(4)}, its turns and chains $${callsUsd.toFixed(4)}. Wrote judged-scenes.md and .json.`);
}

// ---------------------------------------------------------------- the report

type JudgedReply = ScenesReply & { passes?: boolean; said: { evidence?: string; lines: string[] } };

export type ScenesReport = {
  generatedAt: Date;
  calibration: { round3: PlacesAgreement; both: PlacesAgreement };
  round3: { itemId: string; samples: (boolean | undefined)[]; evidence: { evidence?: string; lines: string[] }[] }[];
  round2: { itemId: string; samples: (boolean | undefined)[] }[];
  readings: { label: string; readings: StageArmReading[] }[];
  planReadings: { label: string; readings: StageArmReading[] }[];
  planRows: ScenesPlanRow[];
  judged: JudgedReply[];
  turnTallies: ArmTally[];
  chainTallies: ArmTally[];
  keptComparisons: VariantComparison[];
  waits: TurnWait[];
  spentUsd: number;
  callsUsd: number;
  problems: string[];
};

type Tally = { hits: number; n: number };
const pct = (n: number, d: number) => (d === 0 ? "–" : `${Math.round((100 * n) / d)}%`);
const tallyText = (t?: Tally) => (t ? `${t.hits} of ${t.n} (${pct(t.hits, t.n)})` : "–");
const pText = (p?: number) => (p === undefined ? "" : p < 0.001 ? " (p < 0.001)" : ` (p ${p.toFixed(3)})`);
const verdictText = (v: boolean | "partial" | undefined) => (v === undefined ? "–" : v === "partial" ? "partial" : v ? "yes" : "no");

function readingText(c: StageComparison): string {
  if (c.noise === undefined) return "no noise figure (the reference has one sample)";
  if (c.moved) return `moved ${c.moved}${pText(c.p)}`;
  if (c.beyondNoise) return `beyond the noise, not moved${pText(c.p)}`;
  return "within the noise";
}

const READING_HEAD = ["| Arm | Passing | Against | Arm on the shared pairs | Reference on them | Noise | Reading |", "|---|---|---|---|---|---|---|"];
const readingRows = (readings: StageArmReading[]) =>
  readings.map((r) =>
    r.vsReference && r.referenceKey
      ? `| ${r.armKey} | ${tallyText(r.plans)} | ${r.referenceKey} | ${tallyText(r.vsReference.arm)} | ${tallyText(r.vsReference.reference)} | ${r.vsReference.noise === undefined ? "–" : `${Math.round(100 * r.vsReference.noise)} pts`} | ${readingText(r.vsReference)} |`
      : `| ${r.armKey} | ${tallyText(r.plans)} | – | – | – | – | – |`
  );

const agreementRow = (label: string, a: PlacesAgreement) =>
  `| ${label} | ${a.agree} of ${a.decided} (${pct(a.agree, a.decided)}) | ${a.handPasses} / ${a.handFails} | ${a.falseFails} | ${a.falsePasses} | ${a.pairs ? `${a.pairsAgree} of ${a.pairs}` : "–"} | ${a.partial.yes} / ${a.partial.no} | ${a.reliable ? "reliable" : "not reliable"} |`;

const oneLine = (text: string) => text.replace(/\s+/g, " ").replace(/\|/g, "/").trim();

/** judged-scenes.md */
export function renderJudgedScenes(report: ScenesReport): string {
  const lines = [
    "# Shared scenes in group stories (scenes): people and places across the players' texts",
    "",
    `Generated ${report.generatedAt.toISOString()} from prep-calls.jsonl and calls.jsonl (sharedScenesPrep.ts; the judge parallelThreadsJudge.ts, prompt v${PLACES_JUDGE_PROMPT_VERSION}). Production (adopted) and the variant (sharedScenes) under ${SCENES_PROMPT_STATE}, twice each: chains (the chapter planner, then its group turn on its checked plan) on chapter openings of the third playthroughs, and the group turn on later chapter steps on the plans the round stored, each with production's one checked retry. One Luna low judge call per group turn (placesConsistent: everyone, every group, vehicle and object in one place at a time across the players' texts, every shared place or vehicle in one place and state). A check is reliable when sample 1 agrees on at least 85% of the hand yes and of the hand no, each side holding at least 3, and two samples agree on at least 90%. A candidate reads against production on the (case, sample) pairs both have, production's sample-1-against-sample-2 difference the noise, the stop rule on top. Readings, not verdicts.`,
    "",
    "## Calibration",
    "",
    "| Items | Agree (sample 1) | Hand yes / no | Judged no where the hand says yes | Judged yes where the hand says no | Samples agree | On partial items (yes / no) | Reading |",
    "|---|---|---|---|---|---|---|---|",
    agreementRow("Round 3's hand-read turns", report.calibration.round3),
    agreementRow("With round 2's (fix 4's calibration, its stored verdicts)", report.calibration.both),
    "",
    "| Round-3 item | Hand | Judged (samples) | Hand reading |",
    "|---|---|---|---|",
    ...PLACES_CALIBRATION_R3.map((item) => {
      const j = report.round3.find((x) => x.itemId === item.id);
      return `| ${item.id} | ${verdictText(item.hand)} | ${j?.samples.map(verdictText).join("/") || "–"} | ${item.note} |`;
    }),
  ];
  const disagreements = PLACES_CALIBRATION_R3.flatMap((item) => {
    const j = report.round3.find((x) => x.itemId === item.id);
    const first = j?.samples[0];
    if (item.hand === "partial" || first === undefined || first === item.hand) return [];
    const said = j?.evidence[0];
    return [`- ${item.id}: hand ${verdictText(item.hand)}, judged ${verdictText(first)}. ${(said?.lines ?? []).join("; ")}. Evidence: ${oneLine(said?.evidence ?? "")}`];
  });
  if (disagreements.length) lines.push("", "Where sample 1 disagrees with the hand:", "", ...disagreements);
  lines.push("", "## placesConsistent, the variant against production", "");
  for (const group of report.readings) lines.push(`### ${group.label}`, "", ...READING_HEAD, ...readingRows(group.readings), "");
  lines.push("## Every judged turn (for the hand read)", "", "| Kind | Arm | Case | Sample | Output | Judged | What the judge listed |", "|---|---|---|---|---|---|---|");
  for (const j of [...report.judged].sort((a, b) => a.caseId.localeCompare(b.caseId) || a.sample - b.sample || a.armKey.localeCompare(b.armKey))) {
    lines.push(`| ${j.kind} | ${j.armKey} | ${j.caseId} | ${j.sample} | ${j.outputId} | ${verdictText(j.passes)} | ${oneLine(`${j.said.evidence ?? ""} [${j.said.lines.join("; ")}]`)} |`);
  }
  lines.push("", "## The chains' plans, read by the game (no calls)", "", "Each plan as the plan check keeps it: its threads, those that wrote a scene, the players of other threads its steps and results name (a proxy: naming a player in a result such as \"cutting into Omar's lead\" counts too), and those its scene names.", "");
  for (const group of report.planReadings) lines.push(`### ${group.label}`, "", ...READING_HEAD, ...readingRows(group.readings), "");
  lines.push("| Chain | Arm | Sample | Threads | Scenes | Other players named in steps and results | Other players named in a scene | Scenes |", "|---|---|---|---|---|---|---|---|");
  for (const row of [...report.planRows].sort((a, b) => a.caseId.localeCompare(b.caseId) || a.sample - b.sample || a.armKey.localeCompare(b.armKey))) {
    const named = (list: ThreadNames[]) => list.map((n) => `${n.threadId}: ${n.names.join(", ")}`).join("; ") || "–";
    lines.push(`| ${row.caseId} | ${row.armKey} | ${row.sample} | ${row.threads} | ${row.scenes} | ${named(row.namesOtherPlayers)} | ${named(row.sceneNamesOtherPlayers)} | ${oneLine(row.sceneTexts.join(" / "))} |`);
  }
  lines.push(
    "",
    "## The turns' waits and cost",
    "",
    "| Arm | Jobs | Retried (production's check) | Failed | Mean wait (a chain: its plan and turn) | Cost |",
    "|---|---|---|---|---|---|",
    ...[...report.chainTallies, ...report.turnTallies].map((t) => `| ${t.armKey} | ${t.jobs} | ${t.retried} | ${t.failed} | ${t.meanWaitS.toFixed(1)} s | $${t.costUsd.toFixed(4)} |`),
    ...renderTurnWaits(report.waits),
    "",
    "## The automatic checks on the chapter steps kept (each turn as one call: the reply kept, the whole wait and cost)",
    "",
    ...renderVariantComparison(report.keptComparisons),
    "",
    "## Spend",
    "",
    `Turns and chains (both arms, every attempt): $${report.callsUsd.toFixed(4)}. Judge calls: $${report.spentUsd.toFixed(4)}.`
  );
  if (report.problems.length) lines.push("", "## Problems", "", ...report.problems.map((p) => `- ${p}`));
  return `${lines.join("\n")}\n`;
}
