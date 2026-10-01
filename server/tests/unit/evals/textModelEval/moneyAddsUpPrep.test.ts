import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import {
  MONEY_ARMS,
  moneyCalibrationTargets,
  moneyReadings,
  moneyRepliesToJudge,
  moneyReplyAsPlan,
  moneyReplyRows,
  moneyTargetsToSend,
} from "../../../../src/evals/textModelEval/moneyAddsUpPrep.js";
import type { MoneyCalibrationItem } from "../../../../src/evals/textModelEval/moneyAddsUpJudge.js";
import type { CallRecord } from "../../../../src/evals/textModelEval/runner.js";
import { threadBeat } from "../../../helpers/promptStories.js";
import { stat } from "../../../helpers/textFixtures.js";
import { evalCase, record } from "./fixtures.js";

/*
 * The money-adds-up stage's judge calls: its calibration (hand-read players'
 * turns, stored or of the run, two samples) and every reply of the stage's
 * arms under adopted14 (figuresAddUp, one call per player), each read as the
 * game keeps it; the variant read against production under the stop rule.
 */

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

const [PROD, VARIANT] = MONEY_ARMS;

const CASHBOX = stat("player_cashbox", { name: "Cashbox", type: "number" });
const learning = () => {
  const state = structuredClone(threadBeat(1, { category: "learn-something", playerStats: [CASHBOX] }).getState());
  state.players.player1.statValues = [{ statId: "player_cashbox", value: 10 }];
  return state;
};

const reply = (cashbox: number) => ({
  statChanges: cashbox ? [{ type: "statChange", group: "player1", stat: "player_cashbox", change: "subtractNumber", value: cashbox }] : [],
  newMilestones: "",
  player1: { title: "T", text: "You pay two coins.\n\nEight are left.", options: [], interludes: [], plan: { establishedFacts: [], newGameElements: [] } },
});

const turnRecord = (overrides: Partial<CallRecord>): CallRecord =>
  record({ role: "beat", group: "beat", armKey: VARIANT, callArmKey: VARIANT, baseline: false, promptState: "adopted14", caseId: "round-money-lemonade-t3", outputFile: "outputs\\00000000000000000001.json", ...overrides });

const cases = [evalCase("round-money-lemonade-t3", "beat", { state: learning() }), evalCase("round-money-lemonade-t8", "beat", { state: learning() }), evalCase("cont-a", "beat", { state: learning() })];
const records = [
  turnRecord({}),
  turnRecord({ caseId: "round-money-lemonade-t8", armKey: PROD, callArmKey: PROD, outputFile: "outputs\\00000000000000000002.json" }),
  // Not a stage case, another state, another arm, a failed call: not read
  turnRecord({ caseId: "cont-a", outputFile: "outputs\\00000000000000000004.json" }),
  turnRecord({ promptState: "adopted13", outputFile: "outputs\\00000000000000000005.json" }),
  turnRecord({ armKey: "gpt-6-luna@medium/kidsTurn", callArmKey: "gpt-6-luna@medium/kidsTurn", outputFile: "outputs\\00000000000000000006.json" }),
  turnRecord({ outcome: "schema-mismatch", outputFile: "outputs\\00000000000000000007.json" }),
];
const lookup = { records, cases, load: (r: CallRecord) => reply(r.caseId.endsWith("t3") ? 2 : 0) };

describe("the replies to judge", () => {
  it("reads every final usable reply of the stage's arms on its cases under adopted14, one call per player", () => {
    const replies = moneyRepliesToJudge(lookup);
    expect(replies.map((r) => [r.armKey, r.caseId, r.targets.map((t) => t.key)])).toEqual([
      [VARIANT, "round-money-lemonade-t3", ["00000000000000000001-player1"]],
      [PROD, "round-money-lemonade-t8", ["00000000000000000002-player1"]],
    ]);
    expect(replies[0].targets[0].request.prompt).toContain("figuresAddUp");
    expect(replies[0].targets[0].request.prompt).toContain("Before this turn: 10. This turn's changes: subtract 2. After this turn: 8.");
  });

  it("lists each reply's changes as the game applies them", () => {
    expect(moneyReplyRows(lookup, () => ({ verdict: true, evidence: "adds up" })).map((r) => [r.caseId, r.changes, r.verdict])).toEqual([
      ["round-money-lemonade-t3", ["Cashbox 10 -> 8"], true],
      ["round-money-lemonade-t8", [], true],
    ]);
  });

  it("sends every target, or with --cases only those named", () => {
    const replies = moneyRepliesToJudge(lookup);
    expect(moneyTargetsToSend([], replies, undefined).map((t) => t.key)).toEqual(["00000000000000000001-player1", "00000000000000000002-player1"]);
    expect(moneyTargetsToSend([], replies, ["round-money-lemonade-t8"]).map((t) => t.key)).toEqual(["00000000000000000002-player1"]);
  });

  it("passes a reply only when every player's call passes", () => {
    const [first] = moneyRepliesToJudge(lookup);
    expect(moneyReplyAsPlan(first, () => true)).toMatchObject({ armKey: VARIANT, passes: true, threads: 1 });
    expect(moneyReplyAsPlan(first, () => false)?.passes).toBe(false);
    expect(moneyReplyAsPlan(first, () => undefined)).toBeUndefined();
  });
});

describe("the calibration's targets", () => {
  it("judges a run's reply for its player under the reply's own key at two samples; says what it could not build", () => {
    const items: MoneyCalibrationItem[] = [
      { id: "run-yes", output: "00000000000000000001", slot: "player1", hand: true, note: "y" },
      { id: "missing", output: "99999999999999999999", slot: "player1", hand: true, note: "no such output" },
    ];
    const { targets, problems } = moneyCalibrationTargets({ 1: [], 2: [] }, lookup, items);
    expect(targets.map((t) => [t.itemId, t.key, t.samples])).toEqual([["run-yes", "00000000000000000001-player1", 2]]);
    expect(problems).toEqual([expect.stringMatching(/^missing: /)]);
  });

  it("says so where a stored playthrough turn is not there, in the round the item names", () => {
    const { problems } = moneyCalibrationTargets({ 1: [], 2: [] }, lookup, [{ id: "stored", round: 1, story: "play-lemonade", turn: 5, slot: "player1", hand: false, note: "n" }]);
    expect(problems).toEqual([expect.stringMatching(/^stored: No stored playthrough play-lemonade/)]);
  });
});

describe("the readings", () => {
  it("read the variant against production on the single-player turn model", () => {
    const plan = (armKey: string, caseId: string, sample: number, passes: boolean) => ({ armKey, caseId, sample, outputId: `${armKey}${caseId}${sample}`, passes, threads: 1 });
    const readings = moneyReadings([plan(PROD, "a", 1, false), plan(PROD, "a", 2, true), plan(VARIANT, "a", 1, true), plan(VARIANT, "a", 2, true)]);
    const variant = readings.find((r) => r.armKey === VARIANT);
    expect([variant?.referenceKey, variant?.plans, variant?.vsReference?.reference]).toEqual([PROD, { hits: 2, n: 2 }, { hits: 1, n: 2 }]);
  });
});
