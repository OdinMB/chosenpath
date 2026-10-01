import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { KIDS_AGES_PROMPT_STATE } from "../../../../src/evals/textModelEval/arms.js";
import type { CheckedTurn } from "../../../../src/evals/textModelEval/checkedTurns.js";
import { readabilityOf } from "../../../../src/evals/textModelEval/kidsReadability.js";
import {
  KIDS_AGES_ARMS,
  kidsAgesGroups,
  kidsAgesTurnReadings,
  playerMeasures,
  renderKidsAges,
  setupStatsOf,
  type KidsAgesTurnReading,
} from "../../../../src/evals/textModelEval/kidsAgesPrep.js";
import type { TextMeasures } from "../../../../src/evals/textModelEval/kidsTurnPrep.js";
import type { CallRecord } from "../../../../src/evals/textModelEval/runner.js";
import { beatGeneration, beatSet, stat } from "../../../helpers/textFixtures.js";
import { record } from "./fixtures.js";

/*
 * The kids-ages stage's report (--kids-ages, no calls): each checked turn read
 * whole, every player's kept text against its band's limits
 * (kidsReadability.ts, readsForBand), per age and player count, the variant
 * against production under the stop rule; and the setups' stats against the
 * band's budget.
 */

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

const SHORT = "A cat sits by the door. It is big.\n\nThe mouse hides. She is very still.";
// Five paragraphs of 28 words in two sentences: 140 words, 14 a sentence, a low grade (the 9-12 band's limits)
const LONG = Array.from({ length: 5 }, () => "The old keeper climbed the long stairs before dawn, with a big lamp and a bag of bread for the gulls. Waves crashed on the rocks far below.").join("\n\n");

describe("playerMeasures: every player's beat of a reply", () => {
  it("reads each player's text, options and interludes, and nothing from a reply without beats", () => {
    const reply = beatSet(2, { player1: beatGeneration({ text: SHORT }), player2: beatGeneration({ text: LONG }) });
    const [one, two] = playerMeasures(reply);
    expect(one.words).toBe(readabilityOf(SHORT).words);
    expect(two.words).toBe(readabilityOf(LONG).words);
    expect(playerMeasures({ statChanges: [] })).toEqual([]);
    expect(playerMeasures(undefined)).toEqual([]);
  });
});

const [SINGLE_PROD, SINGLE_KIDS] = KIDS_AGES_ARMS.single;
const [GROUP_PROD, GROUP_KIDS] = KIDS_AGES_ARMS.groups;

const rec = (outputId: string, overrides: Partial<CallRecord> = {}) =>
  record({ caseId: "c", armKey: SINGLE_KIDS, callArmKey: SINGLE_KIDS, promptState: KIDS_AGES_PROMPT_STATE, stage: "kids-ages", baseline: false, outputFile: `outputs/${outputId}.json`, ...overrides });

function turn(overrides: Partial<CheckedTurn> & { sample: number; first: CallRecord }): CheckedTurn {
  return {
    jobKey: `c|${overrides.armKey ?? SINGLE_KIDS}|${KIDS_AGES_PROMPT_STATE}|s${overrides.sample}`,
    promptState: KIDS_AGES_PROMPT_STATE,
    armKey: SINGLE_KIDS,
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

describe("kidsAgesTurnReadings: each turn by its kept reply, every player against the case's band", () => {
  it("passes a turn only where every player's text reads for the band, and reads the band and age from the case", () => {
    const replies: Record<string, unknown> = {
      "outputs/a.json": beatSet(1, { player1: beatGeneration({ text: SHORT }) }),
      "outputs/b.json": beatSet(2, { player1: beatGeneration({ text: SHORT }), player2: beatGeneration({ text: LONG }) }),
      "outputs/c.json": beatSet(1, { player1: beatGeneration({ text: LONG }) }),
    };
    const load = (r: CallRecord) => replies[r.outputFile ?? ""];
    const turns = [
      turn({ sample: 1, caseId: "young", first: rec("a", { caseId: "young" }) }),
      turn({ sample: 1, caseId: "pair", players: 2, armKey: GROUP_KIDS, first: rec("b", { caseId: "pair", armKey: GROUP_KIDS }) }),
      turn({ sample: 1, caseId: "older", first: rec("c", { caseId: "older" }) }),
    ];
    const caseOf = (id: string) => ({ young: { age: 4, players: 1 }, pair: { age: 4, players: 2 }, older: { age: 10, players: 1 } })[id];
    const readings = kidsAgesTurnReadings(turns, load, caseOf);
    expect(readings.map((r) => [r.caseId, r.band, r.age, r.players, r.passes, r.playerPasses])).toEqual([
      ["young", "3-5", 4, 1, false, [false]],
      ["pair", "3-5", 4, 2, false, [false, false]],
      ["older", "9-12", 10, 1, true, [true]],
    ]);
    // A group turn's measures are its players' means
    expect(readings[1].kept?.words).toBeCloseTo((readabilityOf(SHORT).words + readabilityOf(LONG).words) / 2);
  });
});

const m = (words: number, grade: number): TextMeasures => ({ ...readabilityOf(SHORT), words, grade, optionWords: 6, interludeWords: 5 });
const reading = (armKey: string, caseId: string, sample: number, age: number, players: number, words: number, passes: boolean): KidsAgesTurnReading => ({
  armKey,
  caseId,
  sample,
  age,
  band: age <= 5 ? "3-5" : age <= 8 ? "6-8" : "9-12",
  players,
  first: m(words, 3),
  kept: m(words, 3),
  passes,
});

describe("kidsAgesGroups: per age and player count, and the groups' ages pooled", () => {
  it("compares the variant with production on each group's cases, production's two samples as the noise", () => {
    const readings = [
      reading(SINGLE_PROD, "s4a", 1, 4, 1, 100, false),
      reading(SINGLE_PROD, "s4a", 2, 4, 1, 104, false),
      reading(SINGLE_KIDS, "s4a", 1, 4, 1, 60, true),
      reading(SINGLE_KIDS, "s4a", 2, 4, 1, 62, true),
      reading(GROUP_PROD, "g7", 1, 7, 2, 300, false),
      reading(GROUP_PROD, "g7", 2, 7, 2, 310, false),
      reading(GROUP_KIDS, "g7", 1, 7, 2, 120, true),
      reading(GROUP_KIDS, "g7", 2, 7, 2, 118, true),
      reading(GROUP_PROD, "g10", 1, 10, 2, 300, false),
      reading(GROUP_KIDS, "g10", 1, 10, 2, 200, true),
    ];
    const groups = kidsAgesGroups(readings);
    expect(groups.map((g) => g.label)).toEqual(["One player, a child aged 4 (3-5)", "Two players, a child aged 7 (6-8)", "Two players, a child aged 10 (9-12)", "Two players, every age"]);
    const [single4] = groups;
    expect(single4.arms.map((a) => a.armKey)).toEqual([SINGLE_PROD, SINGLE_KIDS]);
    expect(single4.arms[1].vsReference?.measures.find((x) => x.measure === "words")?.noise).toBe(4);
    expect(single4.arms[1].vsReference?.measures.find((x) => x.measure === "words")?.move.moved).toBe("lower");
    const pooled = groups[3];
    expect(pooled.arms[1].passes).toEqual({ hits: 3, n: 3 });
    expect(pooled.arms[0].passes).toEqual({ hits: 0, n: 3 });
  });
});

describe("setupStatsOf: a setup's stats against its band's budget", () => {
  const setup = (shared: number, player: number, hidden = 0) => ({
    sharedStats: Array.from({ length: shared }, (_, i) => stat(`shared_${i}`, { name: i === 0 ? "Snacks" : "Forest Weather Warning Level" })),
    playerStats: [...Array.from({ length: player }, (_, i) => stat(`player_${i}`, { name: "Courage" })), ...Array.from({ length: hidden }, (_, i) => stat(`player_h${i}`, { isVisible: false }))],
  });

  it("counts the visible and hidden stats and the long names, and reads the budget for the band", () => {
    expect(setupStatsOf(setup(2, 3), { min: 10, max: 10 })).toMatchObject({ visibleShared: 2, visiblePlayer: 3, hidden: 0, longNames: 1, fitsBand: true });
    expect(setupStatsOf(setup(2, 3), { min: 7, max: 7 })).toMatchObject({ fitsBand: false });
    expect(setupStatsOf(setup(2, 2, 1), { min: 10, max: 10 })).toMatchObject({ hidden: 1, fitsBand: false });
    expect(setupStatsOf(setup(3, 2), undefined)).toMatchObject({ visibleShared: 3, fitsBand: false });
  });
});

describe("renderKidsAges", () => {
  it("renders the groups, the per-turn table and the setups", () => {
    const readings = [reading(SINGLE_PROD, "s4a", 1, 4, 1, 100, false), reading(SINGLE_KIDS, "s4a", 1, 4, 1, 60, true)];
    const text = renderKidsAges({
      generatedAt: new Date(0),
      tallies: [],
      groups: kidsAgesGroups(readings),
      turns: readings,
      keptComparisons: [],
      setupComparisons: [],
      setups: [{ armKey: KIDS_AGES_ARMS.setups[1], caseId: "round-setup-kids-ages-mouse-a10", sample: 1, age: 10, visibleShared: 2, visiblePlayer: 3, hidden: 0, longNames: 0, names: ["Snacks", "Courage"], fitsBand: true }],
      waits: { kept: [], keptBySample: [], first: [] },
      spendUsd: 0.01,
      problems: [],
    });
    expect(text).toContain("# Read-with-kids turns and setups by the children's age band (kids-ages)");
    expect(text).toContain("One player, a child aged 4 (3-5)");
    expect(text).toContain("| s4a | 1 |");
    expect(text).toContain("round-setup-kids-ages-mouse-a10");
  });
});
