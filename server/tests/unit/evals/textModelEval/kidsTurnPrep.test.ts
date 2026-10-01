import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { KIDS_TURNS_PROMPT_STATE } from "../../../../src/evals/textModelEval/arms.js";
import type { CheckedTurn } from "../../../../src/evals/textModelEval/checkedTurns.js";
import { readabilityOf } from "../../../../src/evals/textModelEval/kidsReadability.js";
import {
  KIDS_ARMS,
  kidsArmReadings,
  kidsTurnReadings,
  measuresOf,
  renderKidsTurns,
  type KidsTurnReading,
  type TextMeasures,
} from "../../../../src/evals/textModelEval/kidsTurnPrep.js";
import type { CallRecord } from "../../../../src/evals/textModelEval/runner.js";
import { beatGeneration, beatSet } from "../../../helpers/textFixtures.js";
import { record } from "./fixtures.js";

/*
 * The kids-turns stage's report (--kids-turns, no calls): each checked turn
 * read whole (the reply the game keeps after production's retry), its text's
 * length and plainness (kidsReadability.ts), its options' and interludes'
 * words, per arm, and the variant against production under the stop rule.
 */

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

const [ADOPTED, KIDS] = KIDS_ARMS;

const KID_TEXT = "Bran sees a big paw print. It is near the door.\n\n“Look!” says Pip. “The cat was here.”";
const HARD_TEXT = "The irregular interpretation of the evidence remains uncertain.\n\nThe irregular interpretation of the evidence remains uncertain.";

describe("measuresOf: a reply's text, options and interludes", () => {
  it("reads the first player's beat", () => {
    const reply = beatSet(1, {
      player1: beatGeneration({
        text: KID_TEXT,
        options: [
          { optionType: "exploration", resourceType: "normal", text: "Hide under the leaf." },
          { optionType: "exploration", resourceType: "normal", text: "Run to the door now." },
        ] as never,
        interludes: [{ imageId: "", imageSource: "none", text: "The cat is big." }],
      }),
    });
    const m = measuresOf(reply) as TextMeasures;
    expect(m.words).toBe(readabilityOf(KID_TEXT).words);
    expect(m.grade).toBeCloseTo(readabilityOf(KID_TEXT).grade);
    expect(m.optionWords).toBeCloseTo(4.5);
    expect(m.interludeWords).toBe(4);
  });

  it("reads nothing from a reply without a player's beat", () => {
    expect(measuresOf(undefined)).toBeUndefined();
    expect(measuresOf({ statChanges: [] })).toBeUndefined();
  });
});

const rec = (outputId: string, overrides: Partial<CallRecord> = {}) =>
  record({ caseId: "c", armKey: KIDS, callArmKey: KIDS, promptState: KIDS_TURNS_PROMPT_STATE, stage: "kids-turns", baseline: false, outputFile: `outputs/${outputId}.json`, ...overrides });

function turn(overrides: Partial<CheckedTurn> & { sample: number; first: CallRecord }): CheckedTurn {
  return {
    jobKey: `c|${overrides.armKey ?? KIDS}|${KIDS_TURNS_PROMPT_STATE}|s${overrides.sample}`,
    promptState: KIDS_TURNS_PROMPT_STATE,
    armKey: KIDS,
    caseId: "c",
    players: 1,
    kept: 1,
    firstShort: false,
    firstWithoutOptions: false,
    keptShort: false,
    firstWaitMs: 20_000,
    waitMs: 20_000,
    firstCostUsd: 0.004,
    costUsd: 0.004,
    hangs: 0,
    ...overrides,
  };
}

describe("kidsTurnReadings: each turn by its first reply and the reply the game keeps", () => {
  it("reads the retry where the game keeps it, the first where it keeps the first, and no kept reply where the turn fails", () => {
    const replies: Record<string, unknown> = {
      "outputs/f1.json": beatSet(1, { player1: beatGeneration({ text: KID_TEXT }) }),
      "outputs/f2.json": beatSet(1, { player1: beatGeneration({ text: "One short paragraph only." }) }),
      "outputs/r2.json": beatSet(1, { player1: beatGeneration({ text: HARD_TEXT }) }),
      "outputs/f3.json": beatSet(1, { player1: beatGeneration({ text: "One." }) }),
    };
    const load = (r: CallRecord) => replies[r.outputFile ?? ""];
    const turns = [
      turn({ sample: 1, first: rec("f1") }),
      turn({ sample: 2, first: rec("f2"), retry: rec("r2", { step: 2 }), retried: "short", kept: 2, firstShort: true }),
      turn({ sample: 3, first: rec("f3"), retry: rec("r3", { step: 2 }), retried: "short", kept: undefined }),
    ];
    const readings = kidsTurnReadings(turns, load);
    expect(readings.map((r) => [r.sample, r.first?.words, r.kept?.words, r.passes])).toEqual([
      [1, 18, 18, true],
      [2, 4, 16, false],
      [3, 1, undefined, undefined],
    ]);
    expect(readings[1].retried).toBe("short");
  });
});

/** A turn's reading with its kept reply's measures. */
const reading = (armKey: string, caseId: string, sample: number, words: number, grade: number, passes: boolean): KidsTurnReading => {
  const m: TextMeasures = { ...readabilityOf(KID_TEXT), words, grade, optionWords: 10, interludeWords: 8 };
  return { armKey, caseId, sample, first: m, kept: m, passes };
};

describe("kidsArmReadings: per arm, and the variant against production under the stop rule", () => {
  const readings = [
    reading(ADOPTED, "a", 1, 300, 8, false),
    reading(ADOPTED, "a", 2, 280, 7, false),
    reading(ADOPTED, "b", 1, 320, 9, false),
    reading(ADOPTED, "b", 2, 300, 8, false),
    reading(KIDS, "a", 1, 120, 3, true),
    reading(KIDS, "a", 2, 110, 2, true),
    reading(KIDS, "b", 1, 130, 3, true),
    reading(KIDS, "b", 2, 100, 2, true),
  ];

  it("means and passes per arm, production's two-sample noise, and the moves", () => {
    const [adopted, kids] = kidsArmReadings(readings);
    expect(adopted.armKey).toBe(ADOPTED);
    expect(adopted.passes).toEqual({ hits: 0, n: 4 });
    expect(adopted.means.words).toBe(300);
    expect(adopted.vsReference).toBeUndefined();
    expect(kids.means.words).toBe(115);
    const vs = kids.vsReference;
    expect(vs?.referenceKey).toBe(ADOPTED);
    expect(vs?.passes.move.moved).toBe("higher");
    const words = vs?.measures.find((m) => m.measure === "words");
    // Production's sample 1 read 310 on average, its sample 2 290
    expect(words?.noise).toBe(20);
    expect(words?.move.moved).toBe("lower");
    expect(vs?.measures.find((m) => m.measure === "grade")?.move.moved).toBe("lower");
    // The same options' words on both: nothing moved
    expect(vs?.measures.find((m) => m.measure === "optionWords")?.move.moved).toBeUndefined();
  });

  it("reads a turn that fails as no pass and no measures", () => {
    const failed: KidsTurnReading = { armKey: KIDS, caseId: "a", sample: 1, first: undefined, kept: undefined, passes: undefined };
    const [, kids] = kidsArmReadings([...readings.filter((r) => !(r.armKey === KIDS && r.caseId === "a" && r.sample === 1)), failed]);
    expect(kids.turns).toBe(4);
    expect(kids.kept).toBe(3);
    expect(kids.passes).toEqual({ hits: 3, n: 4 });
  });
});

describe("renderKidsTurns", () => {
  it("renders the readings, the turns and the per-case table", () => {
    const readings = [reading(ADOPTED, "a", 1, 300, 8, false), reading(KIDS, "a", 1, 120, 3, true)];
    const text = renderKidsTurns({
      generatedAt: new Date(0),
      tallies: [],
      arms: kidsArmReadings(readings),
      firstArms: kidsArmReadings(readings),
      turns: readings,
      keptComparisons: [],
      waits: { kept: [], keptBySample: [], first: [] },
      spendUsd: 0.01,
      problems: [],
    });
    expect(text).toContain("# Read-with-kids turns, shorter and simpler (kids-turns)");
    expect(text).toContain("Reads for a young child");
    expect(text).toContain("| a | 1 |");
  });
});
