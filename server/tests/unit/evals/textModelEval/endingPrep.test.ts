import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { endingCalibrationTargets, endingsToJudge, replyAsPlan, smokeEndingTargets } from "../../../../src/evals/textModelEval/endingPrep.js";
import type { EndingCalibrationItem } from "../../../../src/evals/textModelEval/endingJudge.js";
import type { CallRecord } from "../../../../src/evals/textModelEval/runner.js";
import { endedChapter, outcome, roundStory, topicSwitch } from "../../../helpers/roundStories.js";
import { evalCase, record } from "./fixtures.js";

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

const RING = "player1_ring";
const VARIANT = "gpt-6-luna@medium/endingState";
const GROUP_VARIANT = "gpt-6-luna@low/endingState";

const ending = (players: number, maxTurns = 4) => {
  const slots = Array.from({ length: players }, (_, i) => `player${i + 1}`);
  return roundStory({
    players,
    turns: 4,
    maxTurns,
    sharedOutcomes: players > 1 ? [outcome("shared_ring", { intendedNumberOfMilestones: 3 })] : [],
    playerOutcomes: Object.fromEntries(slots.map((slot) => [slot, [outcome(slot === "player1" ? RING : `${slot}_own`, { intendedNumberOfMilestones: 3 })]])),
    phases: [topicSwitch([["Dig", players > 1 ? "shared_ring" : RING]], 0, slots), endedChapter(players > 1 ? "shared_ring" : RING, 3, 1, "The chapter", slots)],
  }).getState();
};

const reply = (slots: string[]) => ({
  statChanges: [],
  newMilestones: [],
  ...Object.fromEntries(slots.map((slot) => [slot, { title: "The End", text: `${slot}'s ending.\n\nIt stays open.`, options: [], interludes: [], plan: {} }])),
});

const endingRecord = (overrides: Partial<CallRecord>): CallRecord =>
  record({ role: "beat", group: "beat", armKey: VARIANT, callArmKey: VARIANT, baseline: false, promptState: "adopted2", caseId: "end-a", outputFile: "outputs\\00000000000000000001.json", ...overrides });

const cases = [
  evalCase("end-a", "beat", { state: ending(1) }),
  evalCase("round-end-group", "beat", { state: ending(2) }),
  evalCase("cont-a", "beat", { state: ending(1, 20) }),
];
const records = [
  endingRecord({}),
  endingRecord({ caseId: "round-end-group", armKey: GROUP_VARIANT, callArmKey: GROUP_VARIANT, players: 2, outputFile: "outputs\\00000000000000000002.json" }),
  // Not an ending, another state, another arm, a failed call: not read
  endingRecord({ caseId: "cont-a", outputFile: "outputs\\00000000000000000003.json" }),
  endingRecord({ promptState: "adopted3", outputFile: "outputs\\00000000000000000004.json" }),
  endingRecord({ armKey: "gpt-6-luna@medium/turnC", callArmKey: "gpt-6-luna@medium/turnC", outputFile: "outputs\\00000000000000000005.json" }),
  endingRecord({ outcome: "schema-mismatch", outputFile: "outputs\\00000000000000000006.json" }),
];
const lookup = { records, cases, load: (r: CallRecord) => reply(r.caseId === "round-end-group" ? ["player1", "player2"] : ["player1"]) };

describe("the endings to judge", () => {
  it("reads every final usable ending of the arms in the state, one judge call per player", () => {
    const replies = endingsToJudge([VARIANT, GROUP_VARIANT], "adopted2", lookup);
    expect(replies.map((r) => [r.armKey, r.caseId, r.sample, r.outputId, r.slots, r.targets.map((t) => [t.key, t.samples])])).toEqual([
      [VARIANT, "end-a", 1, "00000000000000000001", ["player1"], [["00000000000000000001-player1", 1]]],
      [
        GROUP_VARIANT,
        "round-end-group",
        1,
        "00000000000000000002",
        ["player1", "player2"],
        [
          ["00000000000000000002-player1", 1],
          ["00000000000000000002-player2", 1],
        ],
      ],
    ]);
    expect(replies[1].targets[1].request.prompt).toContain("player2's ending.");
  });

  it("passes a reply only when every player's ending passes", () => {
    const [group] = endingsToJudge([GROUP_VARIANT], "adopted2", lookup);
    expect(replyAsPlan(group, () => true)).toMatchObject({ armKey: GROUP_VARIANT, caseId: "round-end-group", passes: true, threads: 2 });
    expect(replyAsPlan(group, (key) => key.endsWith("player1"))?.passes).toBe(false);
    expect(replyAsPlan(group, (key) => (key.endsWith("player1") ? true : undefined))).toBeUndefined();
  });
});

describe("the calibration's targets", () => {
  const items: EndingCalibrationItem[] = [
    { id: "held", output: "00000000000000000004", slot: "player1", hand: false, writer: "w", note: "an ending of another state" },
    { id: "missing", output: "99999999999999999999", slot: "player1", hand: true, writer: "w", note: "no such output" },
  ];

  it("builds each item's request at two samples from its stored ending, whatever the arm or state, and says what it could not build", () => {
    const { targets, problems } = endingCalibrationTargets(items, lookup);
    expect(targets.map((t) => [t.itemId, t.key, t.samples])).toEqual([["held", "00000000000000000004-player1", 2]]);
    expect(problems).toEqual(["missing: no stored ending 99999999999999999999 for player1"]);
  });

  it("keeps a smoke to the items and endings named, and merges an ending read twice at its most samples", () => {
    const { targets } = endingCalibrationTargets(items, lookup);
    const replies = endingsToJudge([VARIANT, GROUP_VARIANT], "adopted2", lookup);
    expect(smokeEndingTargets(targets, replies, ["held"]).map((t) => t.key)).toEqual(["00000000000000000004-player1"]);
    expect(smokeEndingTargets(targets, replies, ["round-end-group"]).map((t) => t.key)).toEqual(["00000000000000000002-player1", "00000000000000000002-player2"]);
    const twice = smokeEndingTargets([{ ...targets[0], key: "00000000000000000001-player1" }], replies, undefined);
    expect(twice.find((t) => t.key === "00000000000000000001-player1")?.samples).toBe(2);
    expect(twice).toHaveLength(3);
  });
});
