import { describe, expect, it, jest } from "@jest/globals";
import { Story } from "core/models/Story.js";
import type { BeatOption, ChallengeOption, SetOfBeatGenerationSchema } from "core/types/index.js";
import {
  O2B_KEY,
  OPTIONS_O2C_ARMS,
  compareSets,
  renderOptionsO2c,
  setReading,
  type OptionsO2cReport,
  type SetReading,
} from "../../../../src/evals/textModelEval/optionsO2cPrep.js";
import { threadBeat } from "../../../helpers/promptStories.js";
import { beatGeneration, beatSet, challengeOptions, stat, switchAnalysis, threadAnalysis } from "../../../helpers/textFixtures.js";

/*
 * The options-o2c stage's readings (2026-10-01): each first reply's option set
 * on a rolled chapter step read as the game keeps it (the beat repairs): the
 * line O2c's rule gives that state (the reward turn, a sacrifice that fits, a
 * second only for a strong reason, or none), the lever the set carries, the
 * owner's variety checks, and the odds the game would roll (which option kind
 * leads); then each arm against production on the (case, sample) pairs both
 * have, and O2c against O2b's stored replies, under the stop rule.
 */

jest.spyOn(console, "log").mockImplementation(() => undefined);

const STATS = {
  playerStats: [
    stat("player_courage", { name: "Courage", optionsToSacrifice: "Spend 10% Courage for a bold move.", optionsToGainAsReward: "Gain 10% Courage by resting instead of pressing on.", effectOnPoints: ["Above 60%: +15 to bold moves"] }),
    stat("player_wits", { name: "Wits", initialValue: 70 }),
  ],
};

/** A chapter's middle step (threadBeat: step 2 of 3, nothing offered before): today's rate fits, not the reward turn. */
const middleStep = (): Story => threadBeat(1, STATS);
/** The same story at its chapter's first step, the story's first chapter: the reward turn. */
function firstStep(): Story {
  const state = middleStep().getState();
  return Story.create({ ...state, storyPhases: [switchAnalysis(["player1"], 2), threadAnalysis("challenge", 3, 3)] });
}

const option = (overrides: Partial<ChallengeOption>): ChallengeOption => ({ ...challengeOptions()[0], ...overrides });
const sensible = (text = "Ask the guard politely") => option({ text, basePoints: 0, modifiersToSuccessRate: [] });
const tempting = (text = "Charge the gate with your courage") => option({ text, basePoints: -10, modifiersToSuccessRate: [{ statId: "player_courage", reason: "bold", effect: 15 }] });
const witty = (text = "Outwit the guard with a riddle") => option({ text, basePoints: 0, modifiersToSuccessRate: [{ statId: "player_wits", reason: "clever", effect: 10 }] });
const lever = (kind: "sacrifice" | "reward", text = kind === "reward" ? "Stop to rest and gain 10% Courage" : "Spend 10% Courage to leap the gap") =>
  option({ text, resourceType: kind, basePoints: kind === "sacrifice" ? 30 : -30, modifiersToSuccessRate: [] });

const reply = (options: BeatOption[]): SetOfBeatGenerationSchema => beatSet(1, { player1: beatGeneration({ options }) } as never);

describe("setReading: one option set as the game keeps it", () => {
  it("reads the reward turn, the reward offered on it and the option kind that leads the odds", () => {
    const reading = setReading(firstStep(), reply([sensible(), tempting(), lever("reward")]));
    expect(reading).toMatchObject({ line: "reward", todayFits: true, options: 3, lever: "reward", leverText: "Stop to rest and gain 10% Courage", secondSacrifice: false });
    expect(reading.chances).toHaveLength(3);
    expect(reading.leader).toBe("tempting");
    // One normal option without a bonus beside a bare reward: O2's rule passes (a lever needs none), the owner's reading
    // (at most one option without a main stat) doesn't
    expect(reading.statsDistinct).toBe(false);
    expect(reading.leverApart).toBe(true);
    expect(reading.onlyRisk).toBe(false);
  });

  it("reads a middle step's line (a sacrifice fits), the sacrifice leading the odds, and sets that only risk tells apart", () => {
    const reading = setReading(middleStep(), reply([sensible(), sensible("Ask the guard twice"), lever("sacrifice")]));
    expect(reading).toMatchObject({ line: "fits", todayFits: true, lever: "sacrifice", leader: "lever", onlyRisk: true });
    expect(reading.statsDistinct).toBe(false);
  });

  it("reads a set whose bonus options lead: a non-negative base as 'bonus', a negative one as 'tempting'", () => {
    const reading = setReading(middleStep(), reply([witty(), sensible(), sensible("Wait it out")]));
    expect(reading.leader).toBe("bonus");
    expect(reading.lever).toBeUndefined();
  });
});

const reading = (armKey: string, caseId: string, sample: number, overrides: Partial<SetReading> = {}): SetReading => ({
  armKey,
  promptState: armKey === O2B_KEY ? "adopted3" : "adopted20",
  caseId,
  sample,
  line: "none",
  todayFits: false,
  options: 3,
  secondSacrifice: false,
  unreasoned: false,
  statsDistinct: false,
  leverApart: false,
  onlyRisk: false,
  chances: [40, 50, 30],
  leader: "tempting",
  reasoningTokens: 1_800,
  outputTokens: 4_000,
  latencyMs: 34_000,
  costUsd: 0.0035,
  ...overrides,
});

const [PRODUCTION, O2C] = OPTIONS_O2C_ARMS;
const CASES = Array.from({ length: 16 }, (_, i) => `case-${i}`);

describe("compareSets: an arm against its reference on the pairs both have, under the stop rule", () => {
  it("reads O2c's variety and its rewards on the reward turns as moved against production, its noise production's two samples", () => {
    const production = [1, 2].flatMap((s) => CASES.map((c, i) => reading(PRODUCTION, c, s, { statsDistinct: i < 3, line: i < 4 ? "reward" : "none" })));
    const o2c = [1, 2].flatMap((s) => CASES.map((c, i) => reading(O2C, c, s, { statsDistinct: i < 12, line: i < 4 ? "reward" : "none", lever: i < 4 ? "reward" : undefined, reasoningTokens: 1_900 })));
    const rows = compareSets(production, o2c, production);
    const row = (name: string) => rows.measures.find((m) => m.name === name);
    expect(row("statsDistinct")).toMatchObject({ arm: { hits: 24, n: 32 }, reference: { hits: 6, n: 32 }, noise: 0, move: { moved: "higher" } });
    expect(row("rewardOnRewardTurn")).toMatchObject({ arm: { hits: 8, n: 8 }, reference: { hits: 0, n: 8 }, move: { moved: "higher" } });
    expect(row("rewardOffRewardTurn")).toMatchObject({ arm: { hits: 0, n: 24 }, reference: { hits: 0, n: 24 } });
    expect(row("rewardSets")).toMatchObject({ arm: { hits: 8, n: 32 } });
    expect(rows.reasoning.arm.mean).toBe(1_900);
    expect(rows.reasoning.reference.mean).toBe(1_800);
  });

  it("pairs only what both have: O2b's one stored sample against O2c's first", () => {
    const o2b = CASES.map((c) => reading(O2B_KEY, c, 1, { lever: "reward" }));
    const o2c = [1, 2].flatMap((s) => CASES.map((c, i) => reading(O2C, c, s, { lever: i < 2 ? "reward" : undefined })));
    const production = [1, 2].flatMap((s) => CASES.map((c) => reading(PRODUCTION, c, s)));
    const rows = compareSets(o2b, o2c, production);
    expect(rows.measures.find((m) => m.name === "rewardSets")).toMatchObject({ arm: { hits: 2, n: 16 }, reference: { hits: 16, n: 16 }, move: { moved: "lower" } });
  });

  it("counts the balance simulation's 'strength option best' as any bonus option leading, and the tempting option apart", () => {
    const production = [1, 2].flatMap((s) => CASES.map((c, i) => reading(PRODUCTION, c, s, { leader: i % 2 ? "bonus" : "lever" })));
    const rows = compareSets(production, production, production);
    expect(rows.measures.find((m) => m.name === "strengthBest")).toMatchObject({ reference: { hits: 16, n: 32 } });
    expect(rows.measures.find((m) => m.name === "temptingBest")).toMatchObject({ reference: { hits: 0, n: 32 } });
  });
});

describe("renderOptionsO2c", () => {
  it("writes the readings, the per-case sets and every lever's text, without a verdict", () => {
    const production = [1, 2].flatMap((s) => ["case-a", "case-b"].map((c) => reading(PRODUCTION, c, s)));
    const o2c = [1, 2].flatMap((s) => ["case-a", "case-b"].map((c) => reading(O2C, c, s, { line: c === "case-a" ? "reward" : "none", lever: c === "case-a" ? "reward" : undefined, leverText: "Rest | gain 10% Courage" })));
    const report: OptionsO2cReport = {
      generatedAt: new Date("2026-10-01T12:00:00.000Z"),
      sets: [...production, ...o2c],
      againstProduction: compareSets(production, o2c, production),
      againstO2b: undefined,
      keptComparisons: [],
      waits: { kept: [], bySample: [] },
      spendUsd: 0.0281,
      problems: [],
    };
    const md = renderOptionsO2c(report);
    expect(md).toContain("# Option variety with fewer rewards (options-o2c)");
    expect(md).toContain("gpt-6-luna@medium/turnO2c against gpt-6-luna@medium/adopted");
    expect(md).toContain("| case-a | reward |");
    // The lever's text, its pipe escaped for the table
    expect(md).toContain("Rest / gain 10% Courage");
    expect(md).toContain("$0.0281");
    expect(md).not.toMatch(/\b(adopt|verdict|passes)\b/i);
  });
});
