import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { Beat, StoryPhase, ThreadAnalysis } from "core/types/index.js";
import { Story } from "core/models/Story.js";
import {
  RECORDED_ARMS,
  recordedCalibrationTargets,
  recordedPooledKey,
  recordedReadings,
  recordedReferencesOf,
  recordedRepliesToJudge,
  recordedReplyAsPlan,
  recordedTargetsToSend,
} from "../../../../src/evals/textModelEval/recordedResultPrep.js";
import type { RecordedCalibrationItem } from "../../../../src/evals/textModelEval/recordedResultJudge.js";
import type { CallRecord } from "../../../../src/evals/textModelEval/runner.js";
import { createMockMultiplayerStory, createMockStory } from "../../../helpers/testHelpers.js";
import { beatGeneration, switchAnalysis, thread } from "../../../helpers/textFixtures.js";
import { evalCase, record } from "./fixtures.js";

/*
 * The recorded-result stage's judge calls: its calibration (hand-read players'
 * turns, stored or of the run, two samples) and every reply of the stage's
 * arms under adopted9 (recordedResultTold, one call per player in an
 * exploration thread whose recorded result the turn narrates), each read as
 * the game keeps it; readings per arm and with every player count pooled.
 */

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

const [PROD_SINGLE, VARIANT_SINGLE, PROD_GROUP, VARIANT_GROUP] = RECORDED_ARMS;

function history(slot: string, length: number): Beat[] {
  return Array.from({ length }, (_, i) => ({ ...beatGeneration({ text: `${slot} ${i}` }), choice: 1, resolution: "resolution2" as const }));
}

/** The switch turn after a two-step exploration chapter on player1 (and, with `both`, on every player). */
function state(players: number, both = false) {
  const slots = Array.from({ length: players }, (_, i) => `player${i + 1}`);
  const t = thread("exploration", 2, 1, both ? slots : ["player1"]);
  const chapter: ThreadAnalysis = {
    relevantSwitchAndThreadInstructions: "",
    coordinationPatternSummary: "",
    duration: 2,
    firstBeatIndex: 1,
    threads: [{ ...t, progression: t.progression.map((step, k) => ({ ...step, resolution: k === 0 ? ("resolution1" as const) : ("resolution2" as const) })), resolution: "resolution2", milestone: "two" }],
  };
  const phases: StoryPhase[] = [switchAnalysis(slots, 0), chapter, switchAnalysis(slots, 3)];
  const base = (players > 1 ? createMockMultiplayerStory(players) : createMockStory()).getState();
  const players_ = Object.fromEntries(Object.entries(base.players).map(([slot, player]) => [slot, { ...player, beatHistory: history(slot, 3) }]));
  return Story.create({ ...base, players: players_, storyPhases: phases, maxTurns: 20 }).getState();
}

const reply = (slots: string[]) => ({
  statChanges: [],
  newMilestones: [],
  ...Object.fromEntries(slots.map((slot) => [slot, { title: "T", text: `${slot}'s turn.\n\nThe choice holds.`, options: [], interludes: [], plan: { establishedFacts: [], newGameElements: [] } }])),
});

const turnRecord = (overrides: Partial<CallRecord>): CallRecord =>
  record({ role: "beat", group: "beat", armKey: VARIANT_SINGLE, callArmKey: VARIANT_SINGLE, baseline: false, promptState: "adopted9", caseId: "round-recorded-avalon-t16", outputFile: "outputs\\00000000000000000001.json", ...overrides });

const cases = [
  evalCase("round-recorded-avalon-t16", "beat", { state: state(1) }),
  evalCase("round-recorded-space-pirates-t25", "beat", { state: state(3, true) }),
  evalCase("round-recorded-food-trucks-t23", "beat", { state: state(2) }),
  evalCase("cont-a", "beat", { state: state(1) }),
];
const records = [
  turnRecord({}),
  turnRecord({ caseId: "round-recorded-space-pirates-t25", armKey: PROD_GROUP, callArmKey: PROD_GROUP, players: 3, outputFile: "outputs\\00000000000000000002.json" }),
  turnRecord({ caseId: "round-recorded-food-trucks-t23", armKey: VARIANT_GROUP, callArmKey: VARIANT_GROUP, players: 2, outputFile: "outputs\\00000000000000000003.json" }),
  // Not a stage case, another state, another arm, a failed call: not read
  turnRecord({ caseId: "cont-a", outputFile: "outputs\\00000000000000000004.json" }),
  turnRecord({ promptState: "adopted8", outputFile: "outputs\\00000000000000000005.json" }),
  turnRecord({ armKey: "gpt-6-luna@medium/outcomeSettled", callArmKey: "gpt-6-luna@medium/outcomeSettled", outputFile: "outputs\\00000000000000000006.json" }),
  turnRecord({ outcome: "schema-mismatch", outputFile: "outputs\\00000000000000000007.json" }),
];
const slotsOf = (caseId: string) => (caseId.includes("space-pirates") ? ["player1", "player2", "player3"] : caseId.includes("food-trucks") ? ["player1", "player2"] : ["player1"]);
const lookup = { records, cases, load: (r: CallRecord) => reply(slotsOf(r.caseId)) };

describe("the replies to judge", () => {
  it("reads every final usable reply of the stage's arms on its cases, one call per player of an exploration thread", () => {
    const replies = recordedRepliesToJudge(lookup);
    expect(replies.map((r) => [r.armKey, r.caseId, r.targets.map((t) => t.key)])).toEqual([
      [VARIANT_SINGLE, "round-recorded-avalon-t16", ["00000000000000000001-player1"]],
      [PROD_GROUP, "round-recorded-space-pirates-t25", ["00000000000000000002-player1", "00000000000000000002-player2", "00000000000000000002-player3"]],
      [VARIANT_GROUP, "round-recorded-food-trucks-t23", ["00000000000000000003-player1"]],
    ]);
    expect(replies[0].targets[0].request.prompt).toContain("recordedResultTold");
    expect(replies[1].targets[2].request.prompt).toContain("player3's turn.");
  });

  it("sends every target, or with --cases only those named", () => {
    const replies = recordedRepliesToJudge(lookup);
    expect(recordedTargetsToSend([], replies, undefined).map((t) => t.key).length).toBe(5);
    expect(recordedTargetsToSend([], replies, ["round-recorded-food-trucks-t23"]).map((t) => t.key)).toEqual(["00000000000000000003-player1"]);
  });

  it("passes a reply only when every player's call passes", () => {
    const [, group] = recordedRepliesToJudge(lookup);
    expect(recordedReplyAsPlan(group, () => true)).toMatchObject({ armKey: PROD_GROUP, passes: true, threads: 3 });
    expect(recordedReplyAsPlan(group, (key) => !key.endsWith("player2"))?.passes).toBe(false);
    expect(recordedReplyAsPlan(group, () => undefined)).toBeUndefined();
  });
});

describe("the calibration's targets", () => {
  it("judges a run's reply for its player under the reply's own key at two samples, so its sample 1 is also its reading; says what it could not build", () => {
    const items: RecordedCalibrationItem[] = [
      { id: "run-no", output: "00000000000000000003", slot: "player1", hand: false, note: "n" },
      { id: "other-player", output: "00000000000000000003", slot: "player2", hand: true, note: "player2 is in no exploration thread" },
      { id: "missing", output: "99999999999999999999", slot: "player1", hand: true, note: "no such output" },
    ];
    const { targets, problems } = recordedCalibrationTargets([], lookup, items);
    expect(targets.map((t) => [t.itemId, t.key, t.samples])).toEqual([["run-no", "00000000000000000003-player1", 2]]);
    expect(problems).toEqual([expect.stringMatching(/^other-player: /), expect.stringMatching(/^missing: /)]);
  });

  it("says so where a stored playthrough turn is not there", () => {
    const { problems } = recordedCalibrationTargets([], lookup, [{ id: "stored", story: "play-avalon", turn: 16, slot: "player1", hand: true, note: "n" }]);
    expect(problems).toEqual([expect.stringMatching(/^stored: /)]);
  });
});

describe("the readings", () => {
  it("read each variant arm against production on its turn model, and every player count pooled", () => {
    expect(recordedReferencesOf(VARIANT_SINGLE)).toEqual([PROD_SINGLE]);
    expect(recordedReferencesOf(VARIANT_GROUP)).toEqual([PROD_GROUP]);
    expect(recordedReferencesOf(recordedPooledKey(VARIANT_SINGLE))).toEqual([recordedPooledKey(PROD_SINGLE)]);
    expect(recordedPooledKey(VARIANT_GROUP)).toBe(recordedPooledKey(VARIANT_SINGLE));
    const plan = (armKey: string, caseId: string, sample: number, passes: boolean) => ({ armKey, caseId, sample, outputId: `${armKey}${caseId}${sample}`, passes, threads: 1 });
    const readings = recordedReadings([
      plan(PROD_SINGLE, "a", 1, false),
      plan(PROD_SINGLE, "a", 2, true),
      plan(VARIANT_SINGLE, "a", 1, true),
      plan(VARIANT_SINGLE, "a", 2, true),
      plan(PROD_GROUP, "b", 1, false),
      plan(PROD_GROUP, "b", 2, false),
      plan(VARIANT_GROUP, "b", 1, true),
      plan(VARIANT_GROUP, "b", 2, true),
    ]);
    const pooled = readings.find((r) => r.armKey === recordedPooledKey(VARIANT_SINGLE));
    expect([pooled?.plans, pooled?.vsReference?.reference]).toEqual([
      { hits: 4, n: 4 },
      { hits: 1, n: 4 },
    ]);
  });
});
