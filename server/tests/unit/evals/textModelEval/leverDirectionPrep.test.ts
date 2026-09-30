import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { LEVER_DIRECTION_CASES } from "../../../../src/evals/textModelEval/arms.js";
import {
  LEVER_ARMS,
  leverCalibrationTargets,
  leverCounts,
  leverReadings,
  leverSetupAsPlan,
  leverSetupsToJudge,
  leverShares,
  leverTargetsToSend,
} from "../../../../src/evals/textModelEval/leverDirectionPrep.js";
import { LEVER_CHECK, type LeverCalibrationItem, type LeverLabel } from "../../../../src/evals/textModelEval/leverDirectionJudge.js";
import type { CallRecord } from "../../../../src/evals/textModelEval/runner.js";
import { evalCase, record } from "./fixtures.js";

/*
 * The lever-direction stage's judge calls: its calibration (hand-read stored
 * setups, two samples) and every setup of the stage's arms under adopted10
 * (leversRunRightWay, one call per setup), each read as the game keeps it;
 * the setups passing per arm, the variant against production under the stop
 * rule, and the judge's lever labels counted.
 */

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

const [PROD, VARIANT] = LEVER_ARMS;

const stat = (name: string, sacrifice: string, reward: string) => ({ id: name, name, type: "percentage", tooltip: "t", optionsToSacrifice: sacrifice, optionsToGainAsReward: reward });
const setup = (levers: number) => ({
  title: "T",
  sharedStats: [stat("Heat", "Let Heat rise 10%", "Lower Heat 10%"), stat("Score", "None", "None")],
  playerStats: Array.from({ length: levers }, (_, i) => stat(`Fuel ${i}`, "Spend 10% fuel", "None")),
});

const setupRecord = (overrides: Partial<CallRecord>): CallRecord =>
  record({ role: "setup", group: "setup", armKey: VARIANT, callArmKey: VARIANT, baseline: false, promptState: "adopted10", stage: "lever-direction", caseId: LEVER_DIRECTION_CASES[1], outputFile: "outputs\\00000000000000000001.json", ...overrides });

const cases = [...LEVER_DIRECTION_CASES, "setup-custom-shed"].map((id) => evalCase(id, "setup"));
const records = [
  setupRecord({}),
  setupRecord({ armKey: PROD, callArmKey: PROD, sample: 2, outputFile: "outputs\\00000000000000000002.json" }),
  // Not a stage case, another state, another arm, a failed call, a turn: not read
  setupRecord({ caseId: "setup-custom-shed", outputFile: "outputs\\00000000000000000003.json" }),
  setupRecord({ promptState: "adopted1", outputFile: "outputs\\00000000000000000004.json" }),
  setupRecord({ armKey: "gpt-6-luna@low/setupR3", callArmKey: "gpt-6-luna@low/setupR3", outputFile: "outputs\\00000000000000000005.json" }),
  setupRecord({ outcome: "schema-mismatch", outputFile: "outputs\\00000000000000000006.json" }),
  setupRecord({ role: "beat", group: "beat", outputFile: "outputs\\00000000000000000007.json" }),
];
const lookup = { records, cases, load: (r: CallRecord) => setup(r.armKey === PROD ? 2 : 1) };

describe("the setups to judge", () => {
  it("reads every final usable setup of the stage's arms on its cases, one call each, keyed by its output", () => {
    const setups = leverSetupsToJudge(lookup);
    expect(setups.map((s) => [s.armKey, s.caseId, s.sample, s.target.key, s.target.samples, s.statsWithLever, s.stats])).toEqual([
      [VARIANT, LEVER_DIRECTION_CASES[1], 1, "00000000000000000001", 1, 2, 3],
      [PROD, LEVER_DIRECTION_CASES[1], 2, "00000000000000000002", 1, 3, 4],
    ]);
    expect(setups[0].target.request.prompt).toContain(LEVER_CHECK);
    expect(setups[0].target.request.prompt).toContain("Stat 1: Heat");
  });

  it("sends every target, or with --cases only the calibration items and setups named", () => {
    const setups = leverSetupsToJudge(lookup);
    const calibration = [{ itemId: "cal-a", key: "cal-a", request: setups[0].target.request, samples: 2 }];
    expect(leverTargetsToSend(calibration, setups, undefined).map((t) => [t.key, t.samples])).toEqual([
      ["cal-a", 2],
      ["00000000000000000001", 1],
      ["00000000000000000002", 1],
    ]);
    expect(leverTargetsToSend(calibration, setups, ["cal-a"]).map((t) => t.key)).toEqual(["cal-a"]);
    expect(leverTargetsToSend(calibration, setups, [LEVER_DIRECTION_CASES[1]]).map((t) => t.key)).toEqual(["00000000000000000001", "00000000000000000002"]);
  });

  it("passes a setup when the judge answers yes; none while unanswered", () => {
    const [setupRead] = leverSetupsToJudge(lookup);
    expect(leverSetupAsPlan(setupRead, true)).toMatchObject({ armKey: VARIANT, caseId: LEVER_DIRECTION_CASES[1], sample: 1, passes: true, threads: 2 });
    expect(leverSetupAsPlan(setupRead, false)?.passes).toBe(false);
    expect(leverSetupAsPlan(setupRead, undefined)).toBeUndefined();
  });
});

describe("the calibration's targets", () => {
  it("judges each stored setup at two samples under its item's key, and says what it could not build", () => {
    const items: LeverCalibrationItem[] = [
      { id: "stored-no", output: "00000000000000000009", hand: false, note: "n" },
      { id: "no-levers", output: "00000000000000000008", hand: true, note: "every stat None" },
      { id: "missing", output: "99999999999999999999", hand: true, note: "no such output" },
    ];
    const load = (output: string) => (output === "00000000000000000009" ? setup(1) : output === "00000000000000000008" ? { sharedStats: [stat("A", "None", "None")] } : undefined);
    const { targets, problems } = leverCalibrationTargets(load, items);
    expect(targets.map((t) => [t.itemId, t.key, t.samples])).toEqual([["stored-no", "cal-stored-no", 2]]);
    expect(problems).toEqual([expect.stringMatching(/^no-levers: /), expect.stringMatching(/^missing: /)]);
  });
});

describe("the readings", () => {
  const plan = (armKey: string, caseId: string, sample: number, passes: boolean) => ({ armKey, caseId, sample, outputId: `${armKey}${caseId}${sample}`, passes, threads: 1 });

  it("read the variant against production on the setups both have", () => {
    const readings = leverReadings([plan(PROD, "a", 1, false), plan(PROD, "a", 2, true), plan(VARIANT, "a", 1, true), plan(VARIANT, "a", 2, true)]);
    const variant = readings.find((r) => r.armKey === VARIANT);
    expect(variant?.referenceKey).toBe(PROD);
    expect([variant?.vsReference?.arm, variant?.vsReference?.reference, variant?.vsReference?.noise]).toEqual([{ hits: 2, n: 2 }, { hits: 1, n: 2 }, 1]);
  });

  it("count the judge's lever labels per arm, and read the share of levers on stats where more is worse that run the right way", () => {
    const setups = leverSetupsToJudge({ ...lookup, records: [...records, setupRecord({ armKey: PROD, callArmKey: PROD, sample: 1, outputFile: "outputs\\00000000000000000011.json" }), setupRecord({ sample: 2, outputFile: "outputs\\00000000000000000012.json" })] });
    const backwards: LeverLabel = { stat: "Heat", moreIs: "worse for the player", sacrifice: "helps the player", reward: "costs the player" };
    const right: LeverLabel = { stat: "Heat", moreIs: "worse for the player", sacrifice: "costs the player", reward: "helps the player" };
    const labelsOf = (outputId: string) => (outputId === "00000000000000000002" ? [backwards] : outputId === "00000000000000000011" ? [right] : outputId ? [right] : undefined);
    expect(leverCounts(setups, labelsOf).map((k) => [k.armKey, k.setups, k.tally.onWorse, k.tally.backwardsOnWorse, k.statsWithLever, k.stats])).toEqual([
      [PROD, 2, 4, 2, 6, 8],
      [VARIANT, 2, 4, 0, 4, 6],
    ]);
    const [share] = leverShares(setups, labelsOf);
    expect(share).toMatchObject({ armKey: VARIANT, referenceKey: PROD, arm: { hits: 4, n: 4 }, reference: { hits: 2, n: 4 }, noise: 1 });
  });
});
