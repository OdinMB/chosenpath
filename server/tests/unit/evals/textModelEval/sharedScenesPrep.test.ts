import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import fs from "node:fs";
import path from "node:path";
import { Story } from "core/models/Story.js";
import type { Beat, Outcome, StoryPhase, SwitchAnalysis, ThreadAnalysis } from "core/types/index.js";
import { GameModes } from "core/types/index.js";
import { SCENES_CASES, SCENES_PROMPT_STATE } from "../../../../src/evals/textModelEval/arms.js";
import type { CheckedTurn } from "../../../../src/evals/textModelEval/checkedTurns.js";
import { PLACES_CALIBRATION } from "../../../../src/evals/textModelEval/parallelThreadsJudge.js";
import { playthroughRunsFrom } from "../../../../src/evals/textModelEval/playthroughMode.js";
import type { PlayRun } from "../../../../src/evals/textModelEval/playthroughs.js";
import type { CallRecord } from "../../../../src/evals/textModelEval/runner.js";
import {
  PLACES_CALIBRATION_R3,
  SCENES_ARMS,
  SCENES_CHAINS,
  scenesCalibration,
  scenesCalibrationTargets,
  scenesChainPlanRows,
  scenesPlanReadings,
  scenesReadings,
  scenesRepliesToJudge,
  scenesTargetsToSend,
} from "../../../../src/evals/textModelEval/sharedScenesPrep.js";
import { createMockMultiplayerStory } from "../../../helpers/testHelpers.js";
import { beatGeneration, outcome, thread } from "../../../helpers/textFixtures.js";
import { evalCase, record, tags } from "./fixtures.js";

/*
 * The scenes stage's judge calls and readings: the judge's round-3
 * calibration (hand-read stored group turns, two samples), every chain's turn
 * and every chapter step's kept turn of the stage's arms under adopted24
 * (placesConsistent v2, one call per group turn), each read as the game keeps
 * it (the chain's plan checked and applied, the turn repaired); the chains'
 * plans read by the game, no calls; the variant against production per kind
 * and pooled, under the stop rule.
 */

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => undefined);
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

const [PROD_TURN, VARIANT_TURN] = SCENES_ARMS;
const [PROD_CHAIN, VARIANT_CHAIN] = SCENES_CHAINS;
const [CHAIN_CASE] = SCENES_CASES.chains;
const [TURN_CASE] = SCENES_CASES.turns;

const FRIENDSHIP: Outcome = outcome("shared_friendship", { question: "What becomes of the friendship?" });

const sw = (players: string[], type: "topic" | "flavor", outcomes: string[]): SwitchAnalysis["switches"][number] =>
  ({
    players,
    type,
    relevantSuggestedThreadTypes: [],
    previousThreadTypesToBeAvoided: [],
    relevantSwitchAndThreadInstructions: "",
    outcomeId: type === "flavor" ? outcomes[0] : "",
    question: type === "flavor" ? "Who?" : "",
    topicChoices: type === "topic" ? outcomes.map((id) => `Toward ${id} (${id})`) : [],
    ...(type === "topic" ? { topicDirections: outcomes.map((id) => ({ direction: `Toward ${id}`, outcomeId: id })) } : {}),
    relationshipToOtherSwitches: "",
    title: "A switch",
    id: `sw_${players.join("_")}_${type}`,
  }) as SwitchAnalysis["switches"][number];

const switchPhase = (switches: SwitchAnalysis["switches"], firstBeatIndex: number): SwitchAnalysis =>
  ({ coordinationPatternAnalysis: "", coordinationPatternSummary: "", switches, firstBeatIndex, duration: 1 }) as SwitchAnalysis;

function firstChapter(): ThreadAnalysis {
  const t = thread("exploration", 2, 1, ["player1", "player2"]);
  return {
    relevantSwitchAndThreadInstructions: "",
    coordinationPatternSummary: "",
    duration: 2,
    firstBeatIndex: 1,
    threads: [{ ...t, outcomeId: "shared_friendship", progression: t.progression.map((s) => ({ ...s, resolution: "resolution1" as const })), resolution: "resolution1" as const, milestone: "Friends." }],
  };
}

/** Two agents, Rory and Tamsin. */
function story(phases: StoryPhase[], turns: number, picks: number[] = [0, 0]) {
  const base = createMockMultiplayerStory(2).getState();
  const players = Object.fromEntries(
    Object.entries(base.players).map(([slot, player], i) => [
      slot,
      {
        ...player,
        name: ["Rory Finch", "Tamsin Okafor"][i],
        outcomes: [outcome(`${slot}_own`)],
        beatHistory: Array.from({ length: turns }, (_, k): Beat => ({ ...beatGeneration({ text: "A text.", summary: "S." }), choice: k === turns - 1 ? picks[i] : 0, resolution: "resolution1" })),
      },
    ])
  );
  return Story.create({ ...base, gameMode: GameModes.Competitive, sharedOutcomes: [FRIENDSHIP], players, storyPhases: phases, maxTurns: 25 }).getState();
}

// The chapter planner's input: Rory chose his own outcome, Tamsin the friendship
const chapterState = story([switchPhase([sw(["player1", "player2"], "flavor", ["shared_friendship"])], 0), firstChapter(), switchPhase([sw(["player1"], "topic", ["player1_own", "shared_friendship"]), sw(["player2"], "topic", ["shared_friendship", "player2_own"])], 3)], 4, [0, 0]);

/** The chapter the planner wrote: Rory's own room, Tamsin's café thread naming Rory (or not), each with its scene where given. */
function splitPlan(namesRory: boolean, scenes: [string?, string?] = []): ThreadAnalysis {
  const room = thread("exploration", 2, 4, ["player1"]);
  const cafe = thread("exploration", 2, 4, ["player2"]);
  const results = { resolution1: namesRory ? "Tamsin and Rory agree." : "Tamsin writes to Rory.", resolution2: "Tamsin waits.", resolution3: "Tamsin leaves." };
  return {
    relevantSwitchAndThreadInstructions: "",
    coordinationPatternSummary: "",
    duration: 2,
    firstBeatIndex: 4,
    threads: [
      { ...room, id: "room", outcomeId: "player1_own", title: "A Room That Tells the Truth", ...(scenes[0] ? { scene: scenes[0] } : {}) },
      { ...cafe, id: "cafe", outcomeId: "shared_friendship", title: "Off the Clock", possibleMilestones: results, progression: cafe.progression.map((s) => ({ ...s, possibleResolutions: results })), ...(scenes[1] ? { scene: scenes[1] } : {}) },
    ],
  };
}

// A chapter step's input: the split chapter after its first step
const stepState = (() => {
  const chapter = splitPlan(true);
  return story([switchPhase([sw(["player1", "player2"], "flavor", ["shared_friendship"])], 0), firstChapter(), switchPhase([sw(["player1"], "topic", ["player1_own"]), sw(["player2"], "topic", ["shared_friendship"])], 3), { ...chapter, threads: chapter.threads.map((t) => ({ ...t, progression: t.progression.map((s, i) => ({ ...s, resolution: i === 0 ? ("resolution1" as const) : null })) })) }], 5);
})();

const group = tags({ source: "round", multiplayer: true, players: 2 });
const cases = [evalCase(CHAIN_CASE, "thread", { state: chapterState, tags: group }), evalCase(TURN_CASE, "beat", { state: stepState, tags: group })];

const turnReply = (roryAtCafe: boolean) => ({
  statChanges: [],
  newMilestones: "",
  player1: { title: "T", text: "Rory moves the lanterns in the conservatory.\n\nThe glass is bare.", options: [], interludes: [], plan: { establishedFacts: [], newGameElements: [] } },
  player2: { title: "T", text: `Tamsin sits at the Amber Cup.${roryAtCafe ? " Rory sits across from her." : " She writes to Rory."}\n\nThe harbor is grey.`, options: [], interludes: [], plan: { establishedFacts: [], newGameElements: [] } },
});

const out = (n: number) => `outputs\\${String(n).padStart(20, "0")}.json`;
const base = { promptState: SCENES_PROMPT_STATE, stage: "scenes" as const, baseline: false, players: 2 };
const chainKey = (arm: string, s = 1) => `${CHAIN_CASE}|${arm}|${SCENES_PROMPT_STATE}|s${s}`;
const records: CallRecord[] = [
  // Production's chain: its plan (step 1), then its turn (step 2); the variant's
  record({ ...base, role: "thread", group: "pipeline", caseId: CHAIN_CASE, armKey: PROD_CHAIN, callArmKey: PROD_TURN, jobKey: chainKey(PROD_CHAIN), step: 1, jobFinal: false, outputFile: out(1) }),
  record({ ...base, role: "beat", group: "pipeline", caseId: CHAIN_CASE, armKey: PROD_CHAIN, callArmKey: PROD_TURN, jobKey: chainKey(PROD_CHAIN), step: 2, outputFile: out(2) }),
  record({ ...base, role: "thread", group: "pipeline", caseId: CHAIN_CASE, armKey: VARIANT_CHAIN, callArmKey: VARIANT_TURN, jobKey: chainKey(VARIANT_CHAIN), step: 1, jobFinal: false, outputFile: out(3) }),
  record({ ...base, role: "beat", group: "pipeline", caseId: CHAIN_CASE, armKey: VARIANT_CHAIN, callArmKey: VARIANT_TURN, jobKey: chainKey(VARIANT_CHAIN), step: 2, outputFile: out(4) }),
  // Another tag: not read
  record({ ...base, promptState: "adopted23", role: "beat", group: "pipeline", caseId: CHAIN_CASE, armKey: PROD_CHAIN, callArmKey: PROD_TURN, jobKey: `${CHAIN_CASE}|${PROD_CHAIN}|adopted23|s1`, step: 2, outputFile: out(5) }),
];
const outputs: Record<string, unknown> = {
  [out(1)]: splitPlan(true),
  [out(2)]: turnReply(true),
  [out(3)]: splitPlan(false, ["Gloam House's conservatory, with the buyer.", "The Amber Cup café, with the owner; Rory Finch is elsewhere."]),
  [out(4)]: turnReply(false),
  [out(5)]: turnReply(true),
  [out(6)]: turnReply(true),
  [out(7)]: turnReply(false),
};

const turnRecord = (arm: string, n: number) => record({ ...base, role: "beat", group: "beat", caseId: TURN_CASE, armKey: arm, callArmKey: arm, jobKey: `${TURN_CASE}|${arm}|${SCENES_PROMPT_STATE}|s1`, outputFile: out(n) });
const checked = (arm: string, n: number, kept: 1 | 0 = 1): CheckedTurn => ({
  jobKey: `${TURN_CASE}|${arm}|${SCENES_PROMPT_STATE}|s1`,
  promptState: SCENES_PROMPT_STATE,
  armKey: arm,
  caseId: TURN_CASE,
  sample: 1,
  players: 2,
  first: turnRecord(arm, n),
  ...(kept ? { kept } : {}),
  firstShort: false,
  firstWithoutOptions: false,
  firstWaitMs: 30_000,
  waitMs: 30_000,
  firstCostUsd: 0.005,
  costUsd: 0.005,
  hangs: 0,
});
const turns = [checked(PROD_TURN, 6), checked(VARIANT_TURN, 7)];
const lookup = { records, cases, load: (r: CallRecord) => outputs[r.outputFile ?? ""] };

describe("the replies to judge", () => {
  it("reads every chain's final usable turn on the story its own plan made, and every chapter step's kept turn, under the stage's tag", () => {
    const replies = scenesRepliesToJudge(lookup, turns);
    expect(replies.map((r) => [r.kind, r.armKey, r.caseId, r.sample, r.target.key])).toEqual([
      ["chain", PROD_CHAIN, CHAIN_CASE, 1, "00000000000000000002"],
      ["chain", VARIANT_CHAIN, CHAIN_CASE, 1, "00000000000000000004"],
      ["turn", PROD_TURN, TURN_CASE, 1, "00000000000000000006"],
      ["turn", VARIANT_TURN, TURN_CASE, 1, "00000000000000000007"],
    ]);
    const prompt = replies[0].target.request.prompt;
    expect(prompt).toContain('Thread "A Room That Tells the Truth": Rory Finch (player1)');
    expect(prompt).toContain('Thread "Off the Clock": Tamsin Okafor (player2)');
    expect(prompt).toContain("[1] Tamsin sits at the Amber Cup. Rory sits across from her.");
  });

  it("reads no chapter step whose turn the game keeps no reply of", () => {
    expect(scenesRepliesToJudge(lookup, [checked(PROD_TURN, 6, 0)]).filter((r) => r.kind === "turn")).toEqual([]);
  });

  it("sends the calibration and every reply, or with --cases only those named", () => {
    const replies = scenesRepliesToJudge(lookup, turns);
    const calibration = [{ itemId: "cal", key: "scenes-cal-x", request: replies[0].target.request, samples: 2 }];
    expect(scenesTargetsToSend(calibration, replies, undefined).map((t) => [t.key, t.samples])).toEqual([
      ["scenes-cal-x", 2],
      ["00000000000000000002", 1],
      ["00000000000000000004", 1],
      ["00000000000000000006", 1],
      ["00000000000000000007", 1],
    ]);
    expect(scenesTargetsToSend(calibration, replies, [TURN_CASE]).map((t) => t.key)).toEqual(["00000000000000000006", "00000000000000000007"]);
  });
});

describe("the chains' plans, read by the game", () => {
  it("reads each plan's threads: their scenes, the players of other threads their steps and results name, the players of other threads their scenes name", () => {
    const rows = scenesChainPlanRows(lookup);
    expect(rows.map((r) => [r.armKey, r.threads, r.scenes, r.namesOtherPlayers.map((n) => `${n.threadId}: ${n.names.join(", ")}`), r.sceneNamesOtherPlayers.map((n) => `${n.threadId}: ${n.names.join(", ")}`)])).toEqual([
      [PROD_CHAIN, 2, 0, ["cafe: Rory Finch"], []],
      [VARIANT_CHAIN, 2, 2, ["cafe: Rory Finch"], ["cafe: Rory Finch"]],
    ]);
  });

  it("reads the variant against production on the plans under the stop rule", () => {
    const groups = scenesPlanReadings(scenesChainPlanRows(lookup));
    expect(groups.map((g) => g.label)).toEqual(["Chapter plans: no thread's steps or results name a player of another thread"]);
    const variant = groups[0].readings.find((r) => r.armKey === VARIANT_CHAIN);
    expect([variant?.plans, variant?.referenceKey, variant?.vsReference?.reference]).toEqual([{ hits: 0, n: 1 }, PROD_CHAIN, { hits: 0, n: 1 }]);
  });
});

describe("the readings", () => {
  const verdict = (kind: "chain" | "turn", armKey: string, caseId: string, sample: number, passes: boolean) => ({ kind, armKey, caseId, sample, outputId: `${armKey}${caseId}${sample}`, passes });

  it("read each kind's variant against its production, and the two pooled, production's two samples the noise", () => {
    const verdicts = [
      verdict("chain", PROD_CHAIN, "a", 1, false),
      verdict("chain", PROD_CHAIN, "a", 2, false),
      verdict("chain", VARIANT_CHAIN, "a", 1, true),
      verdict("chain", VARIANT_CHAIN, "a", 2, true),
      verdict("turn", PROD_TURN, "b", 1, true),
      verdict("turn", PROD_TURN, "b", 2, false),
      verdict("turn", VARIANT_TURN, "b", 1, true),
      verdict("turn", VARIANT_TURN, "b", 2, true),
    ];
    const groups = scenesReadings(verdicts);
    expect(groups.map((g) => g.label)).toEqual(["Chains (the chapter planner, then its group turn)", "Chapter steps on the plans the round stored", "Chains and chapter steps pooled"]);
    const [chains, steps, pooled] = groups.map((g) => g.readings.find((r) => r.vsReference));
    expect([chains?.armKey, chains?.referenceKey, chains?.vsReference?.arm, chains?.vsReference?.reference]).toEqual([VARIANT_CHAIN, PROD_CHAIN, { hits: 2, n: 2 }, { hits: 0, n: 2 }]);
    expect([steps?.armKey, steps?.vsReference?.arm, steps?.vsReference?.reference, steps?.vsReference?.noise]).toEqual([VARIANT_TURN, { hits: 2, n: 2 }, { hits: 1, n: 2 }, 1]);
    expect([pooled?.armKey, pooled?.referenceKey, pooled?.vsReference?.arm, pooled?.vsReference?.reference]).toEqual(["sharedScenes", "production", { hits: 4, n: 4 }, { hits: 1, n: 4 }]);
  });
});

describe("the calibration", () => {
  it("reads round 3's hand-read items beside round 2's stored verdicts, reliable on both together", () => {
    const r3 = PLACES_CALIBRATION_R3.map((item) => ({ itemId: item.id, samples: [item.hand === "partial" ? true : item.hand, item.hand === "partial" ? true : item.hand] }));
    const r2 = PLACES_CALIBRATION.map((item) => ({ itemId: item.id, samples: [item.hand === "partial" ? true : item.hand, item.hand === "partial" ? true : item.hand] }));
    const reading = scenesCalibration(r3, r2);
    expect([reading.round3.reliable, reading.both.reliable, reading.both.decided]).toEqual([true, true, reading.round3.decided + 18]);
    // A judge that passes every round-3 item fails its hand no
    const lenient = scenesCalibration(PLACES_CALIBRATION_R3.map((item) => ({ itemId: item.id, samples: [true, true] })), r2);
    expect([lenient.round3.reliable, lenient.round3.falsePasses]).toEqual([false, PLACES_CALIBRATION_R3.filter((i) => i.hand === false).length]);
  });

  it("holds hand-read items from all three group stories, both verdicts, read before any judge call", () => {
    const stories = new Set(PLACES_CALIBRATION_R3.map((i) => i.story));
    expect([...stories].sort()).toEqual(["play-estate-agents", "play-food-trucks", "play-space-pirates"]);
    expect(PLACES_CALIBRATION_R3.filter((i) => i.hand === true).length).toBeGreaterThanOrEqual(3);
    expect(PLACES_CALIBRATION_R3.filter((i) => i.hand === false).length).toBeGreaterThanOrEqual(3);
    for (const item of PLACES_CALIBRATION_R3) expect(item.id.startsWith("r3-")).toBe(true);
  });

  it("says so where a stored playthrough turn is not there", () => {
    const { targets, problems } = scenesCalibrationTargets([], [{ id: "r3-x", story: "play-food-trucks", turn: 6, hand: true, note: "n" }]);
    expect(targets).toEqual([]);
    expect(problems).toEqual([expect.stringMatching(/^r3-x: /)]);
  });

  const DIR = path.resolve("..", "DOCS", "2026-09-26_gpt6-text-eval");
  const stored3: PlayRun[] = fs.existsSync(path.join(DIR, "playthroughs-3.json")) ? playthroughRunsFrom(JSON.parse(fs.readFileSync(path.join(DIR, "playthroughs-3.json"), "utf-8"))) : [];

  (stored3.length ? it : it.skip)("builds every round-3 item on the stored playthroughs, each a group chapter step with its turn's texts, at two samples", () => {
    const { targets, problems } = scenesCalibrationTargets(stored3);
    expect(problems).toEqual([]);
    expect(targets.map((t) => t.itemId)).toEqual(PLACES_CALIBRATION_R3.map((i) => i.id));
    for (const t of targets) expect([t.itemId, t.samples, t.key]).toEqual([t.itemId, 2, `scenes-cal-${t.itemId}`]);
    const cafe = targets.find((t) => t.itemId === "r3-estate-agents-t6");
    expect(cafe?.request.prompt).toContain("You find Rory at The Amber Cup");
    const engine = targets.find((t) => t.itemId === "r3-space-pirates-t6");
    expect(engine?.request.prompt).toContain("join Tomas and Davi beneath the bridge");
  });
});
