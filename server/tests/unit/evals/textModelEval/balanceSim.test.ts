import { describe, expect, it, jest } from "@jest/globals";
import type { ChallengeOption } from "core/types/index.js";
import { b6Scale, balanceSimulation, favorableChances, renderBalanceSim, type BalanceSet } from "../../../../src/evals/textModelEval/balanceSim.js";
import { threadBeat } from "../../../helpers/promptStories.js";
import { challengeOptions } from "../../../helpers/textFixtures.js";

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

const bonus = (statId: string, effect: number) => ({ statId, reason: "fits", effect });

/** A sensible option, a strength option (+15 on its own stat) and a sacrifice, all with the whole step's +10 Luck */
function options(): ChallengeOption[] {
  const [sensible, strength, lever] = challengeOptions();
  return [
    { ...sensible, modifiersToSuccessRate: [bonus("player1_luck", 10)] },
    { ...strength, modifiersToSuccessRate: [bonus("player1_charm", 15), bonus("player1_luck", 10)] },
    { ...lever, resourceType: "sacrifice", basePoints: 30, modifiersToSuccessRate: [bonus("player1_luck", 10)] },
  ];
}

describe("b6Scale: B6's base points and bonuses on stored options", () => {
  it("gives a strength option -10 and drops a stat that fits the whole step", () => {
    const scaled = b6Scale(options());
    expect(scaled.map((o) => o.basePoints)).toEqual([0, -10, 30]);
    expect(scaled.map((o) => o.modifiersToSuccessRate.map((m) => m.statId))).toEqual([[], ["player1_charm"], []]);
  });

  it("keeps a strength option already below zero and a set without a shared stat", () => {
    const [a, b, c] = challengeOptions();
    const set = [a, { ...b, basePoints: -15, modifiersToSuccessRate: [bonus("player1_charm", 15)] }, c];
    expect(b6Scale(set).map((o) => o.basePoints)).toEqual([0, -15, 0]);
  });
});

describe("favorableChances: the game's own resolution code", () => {
  it("reads each option's favorable chance from its points, the step's momentum and the difficulty", () => {
    // threadBeat: step 2 after a favorable step 1 (+30 momentum), difficulty 0
    const story = threadBeat(1);
    const [plain] = challengeOptions();
    const chances = favorableChances(story, [plain, { ...plain, basePoints: -30 }, { ...plain, basePoints: 30 }]);
    expect(chances[1]).toBeLessThan(chances[0]);
    expect(chances[2]).toBeGreaterThan(chances[0]);
  });
});

describe("balanceSimulation", () => {
  it("reads today's and B6's scale side by side: odds by option kind, ties and the strength option's lead", () => {
    const sets: BalanceSet[] = [{ caseId: "c", sample: 1, story: threadBeat(1), options: options() }];
    const report = balanceSimulation(sets);
    expect(report.sets).toBe(1);
    const [today, scaled] = report.scenarios;
    expect(today.name).toBe("today");
    expect(scaled.strength).toBeLessThan(today.strength as number);
    expect(scaled.strengthBest).toBeLessThanOrEqual(today.strengthBest);
    const text = renderBalanceSim(report, new Date(0));
    expect(text).toContain("# B6 balance simulation");
    expect(text).toContain("| Favorable chance, strength options |");
  });
});
