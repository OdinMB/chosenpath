import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import {
  SETTLED_ARMS,
  pooledKey,
  settledCalibrationTargets,
  settledReadings,
  settledReferencesOf,
  settledRepliesToJudge,
  settledReplyAsPlan,
  settledTargetsToSend,
  withEdits,
} from "../../../../src/evals/textModelEval/outcomeSettledPrep.js";
import type { SettledCalibrationItem } from "../../../../src/evals/textModelEval/outcomeSettledJudge.js";
import type { CallRecord } from "../../../../src/evals/textModelEval/runner.js";
import { endedChapter, outcome, roundStory, topicSwitch } from "../../../helpers/roundStories.js";
import { evalCase, record } from "./fixtures.js";

/*
 * The outcome-settled stage's judge calls: its calibration (hand-read switch
 * turns, stored or of the run, two samples), every switch turn of the stage's
 * arms under adopted8 (completedToldSettled, one call per reply) and every
 * ending (the ending's outcomesToldAsLeft, one call per player), each read as
 * the game keeps it; readings per arm and with every player count pooled.
 */

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

const [PROD_SINGLE, VARIANT_SINGLE, PROD_GROUP, VARIANT_GROUP, RETEST_SINGLE, RETEST_GROUP] = SETTLED_ARMS;
const GUILD = "player1_guild";

/** A switch after a chapter completing the guild outcome (1 of 2 before), or the ending after it, for `players`. */
function state(players: number, ending: boolean) {
  const slots = Array.from({ length: players }, (_, i) => `player${i + 1}`);
  const id = players > 1 ? "shared_guild" : GUILD;
  return roundStory({
    players,
    turns: 5,
    maxTurns: ending ? 5 : 20,
    sharedOutcomes: players > 1 ? [outcome(id, { milestones: ["one"] })] : [],
    playerOutcomes: Object.fromEntries(slots.map((slot) => [slot, slot === "player1" && players === 1 ? [outcome(GUILD, { milestones: ["one"] })] : [outcome(`${slot}_own`)]])),
    phases: [topicSwitch([["Petition", id]], 0, slots), endedChapter(id, 4, 1, "The Guild adopts it", slots), ...(ending ? [] : [topicSwitch([["Petition", id]], 5, slots)])],
  }).getState();
}

const reply = (slots: string[]) => ({
  statChanges: [],
  newMilestones: [],
  ...Object.fromEntries(slots.map((slot) => [slot, { title: "T", text: `${slot}'s turn.\n\nThe charter stands.`, options: [], interludes: [], plan: { establishedFacts: [], newGameElements: [] } }])),
});

const turnRecord = (overrides: Partial<CallRecord>): CallRecord =>
  record({ role: "beat", group: "beat", armKey: VARIANT_SINGLE, callArmKey: VARIANT_SINGLE, baseline: false, promptState: "adopted8", caseId: "round-settled-avalon-t16", outputFile: "outputs\\00000000000000000001.json", ...overrides });

const cases = [
  evalCase("round-settled-avalon-t16", "beat", { state: state(1, false) }),
  evalCase("round-settled-avalon-t26", "beat", { state: state(1, true) }),
  evalCase("round-settled-space-pirates-t14", "beat", { state: state(2, false) }),
  evalCase("cont-a", "beat", { state: state(1, false) }),
];
const records = [
  turnRecord({}),
  turnRecord({ caseId: "round-settled-avalon-t26", outputFile: "outputs\\00000000000000000002.json" }),
  turnRecord({ caseId: "round-settled-space-pirates-t14", armKey: PROD_GROUP, callArmKey: PROD_GROUP, players: 2, outputFile: "outputs\\00000000000000000003.json" }),
  // Not a stage case, another state, another arm, a failed call: not read
  turnRecord({ caseId: "cont-a", outputFile: "outputs\\00000000000000000004.json" }),
  turnRecord({ promptState: "adopted7", outputFile: "outputs\\00000000000000000005.json" }),
  turnRecord({ armKey: "gpt-6-luna@medium/choiceResult", callArmKey: "gpt-6-luna@medium/choiceResult", outputFile: "outputs\\00000000000000000006.json" }),
  turnRecord({ outcome: "schema-mismatch", outputFile: "outputs\\00000000000000000007.json" }),
];
const lookup = { records, cases, load: (r: CallRecord) => reply(r.caseId.includes("space-pirates") ? ["player1", "player2"] : ["player1"]) };

describe("the replies to judge", () => {
  it("reads every final usable reply of the stage's arms on its cases: a switch turn once, an ending once per player", () => {
    const replies = settledRepliesToJudge(lookup);
    expect(replies.map((r) => [r.armKey, r.caseId, r.kind, r.targets.map((t) => t.key)])).toEqual([
      [VARIANT_SINGLE, "round-settled-avalon-t16", "switch", ["00000000000000000001"]],
      [VARIANT_SINGLE, "round-settled-avalon-t26", "ending", ["00000000000000000002-player1"]],
      [PROD_GROUP, "round-settled-space-pirates-t14", "switch", ["00000000000000000003"]],
    ]);
    expect(replies[0].targets[0].request.prompt).toContain("completedToldSettled");
    expect(replies[1].targets[0].request.prompt).toContain("outcomesToldAsLeft");
    expect(replies[2].targets[0].request.prompt).toContain("player2's turn.");
  });

  it("splits the calls a run sends by check, and with --cases only those named", () => {
    const replies = settledRepliesToJudge(lookup);
    const all = settledTargetsToSend([], replies, undefined);
    expect(all.settled.map((t) => t.key)).toEqual(["00000000000000000001", "00000000000000000003"]);
    expect(all.endings.map((t) => t.key)).toEqual(["00000000000000000002-player1"]);
    const smoke = settledTargetsToSend([], replies, ["round-settled-avalon-t26"]);
    expect([smoke.settled.length, smoke.endings.length]).toEqual([0, 1]);
  });

  it("passes a reply only when every call on it passes", () => {
    const [single] = settledRepliesToJudge(lookup);
    expect(settledReplyAsPlan(single, () => true)).toMatchObject({ armKey: VARIANT_SINGLE, passes: true, threads: 1 });
    expect(settledReplyAsPlan(single, () => false)?.passes).toBe(false);
    expect(settledReplyAsPlan(single, () => undefined)).toBeUndefined();
  });
});

describe("the calibration's targets", () => {
  it("judges a run's reply under its own key at two samples, so its sample 1 is also its reading; says what it could not build", () => {
    const items: SettledCalibrationItem[] = [
      { id: "run-no", output: "00000000000000000001", hand: false, note: "n" },
      { id: "ending", output: "00000000000000000002", hand: true, note: "an ending completes nothing at a switch" },
      { id: "missing", output: "99999999999999999999", hand: true, note: "no such output" },
    ];
    const { targets, problems } = settledCalibrationTargets([], lookup, items);
    expect(targets.map((t) => [t.itemId, t.key, t.samples])).toEqual([["run-no", "00000000000000000001", 2]]);
    expect(problems).toEqual([expect.stringMatching(/^ending: /), expect.stringMatching(/^missing: /)]);
  });

  it("says so where a stored playthrough turn is not there", () => {
    const { problems } = settledCalibrationTargets([], lookup, [{ id: "stored", story: "play-avalon", turn: 16, hand: false, note: "n" }]);
    expect(problems).toEqual([expect.stringMatching(/^stored: /)]);
  });
});

describe("a constructed version of a reply", () => {
  const base = { statChanges: [{ type: "statChange", group: "player1", stat: "x", change: "addNumber", value: 10 }], newMilestones: [], player1: { text: "“It is yours,” she says.\n\nThe award stands." } };

  it("replaces a passage of text wherever it occurs, and a passage of the reply's own fields", () => {
    const edited = withEdits(base as never, [
      ["“It is yours,” she says.", "“It stays provisional,” she says."],
      ['"change":"addNumber","value":10', '"change":"subtractNumber","value":30'],
    ]) as unknown as typeof base;
    expect(edited.player1.text).toBe("“It stays provisional,” she says.\n\nThe award stands.");
    expect(edited.statChanges[0]).toMatchObject({ change: "subtractNumber", value: 30 });
  });

  it("refuses a passage the reply doesn't hold", () => {
    expect(() => withEdits(base as never, [["not there", "x"]])).toThrow(/not in the reply/);
  });
});

describe("the readings", () => {
  it("read each variant arm against production on its turn model, and every player count pooled; the retest against the run's lines too", () => {
    expect(settledReferencesOf(VARIANT_SINGLE)).toEqual([PROD_SINGLE]);
    expect(settledReferencesOf(VARIANT_GROUP)).toEqual([PROD_GROUP]);
    expect(settledReferencesOf(pooledKey(VARIANT_SINGLE))).toEqual([pooledKey(PROD_SINGLE)]);
    expect(settledReferencesOf(RETEST_SINGLE)).toEqual([PROD_SINGLE, VARIANT_SINGLE]);
    expect(settledReferencesOf(RETEST_GROUP)).toEqual([PROD_GROUP, VARIANT_GROUP]);
    expect(settledReferencesOf(pooledKey(RETEST_SINGLE))).toEqual([pooledKey(PROD_SINGLE), pooledKey(VARIANT_SINGLE)]);
    expect(pooledKey(VARIANT_GROUP)).toBe(pooledKey(VARIANT_SINGLE));
    const plan = (armKey: string, caseId: string, sample: number, passes: boolean) => ({ armKey, caseId, sample, outputId: `${armKey}${caseId}${sample}`, passes, threads: 1 });
    const readings = settledReadings([
      plan(PROD_SINGLE, "a", 1, false),
      plan(PROD_SINGLE, "a", 2, false),
      plan(VARIANT_SINGLE, "a", 1, true),
      plan(VARIANT_SINGLE, "a", 2, true),
      plan(PROD_GROUP, "b", 1, false),
      plan(PROD_GROUP, "b", 2, true),
      plan(VARIANT_GROUP, "b", 1, true),
      plan(VARIANT_GROUP, "b", 2, true),
    ]);
    const pooled = readings.find((r) => r.armKey === pooledKey(VARIANT_SINGLE));
    expect([pooled?.plans, pooled?.vsReference?.reference]).toEqual([
      { hits: 4, n: 4 },
      { hits: 1, n: 4 },
    ]);
  });
});
