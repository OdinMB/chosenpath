import { describe, expect, it, jest } from "@jest/globals";
import type { BeatOption, SetOfBeatGenerationSchema } from "core/types/index.js";
import type { Story } from "core/models/Story.js";
import {
  GROUP_LEVERS_ARMS,
  groupLeverArmReadings,
  groupTurnReading,
  renderGroupLevers,
  type GroupLeversReport,
  type GroupTurnReading,
} from "../../../../src/evals/textModelEval/groupLeversPrep.js";
import { threadBeat } from "../../../helpers/promptStories.js";
import { beatGeneration, beatSet, challengeOptions, stat } from "../../../helpers/textFixtures.js";

/*
 * The group-levers stage's readings (2026-10-01): each kept group turn read
 * per player in a challenge or contest thread, as the game keeps it (the beat
 * repairs, so a shared lever's later copy is dropped): the lever the set
 * carries, its stat as the game reads it (own or shared, and whether the stat
 * allows that lever), against the player's computed line; then per arm,
 * against production under the stop rule.
 */

jest.spyOn(console, "log").mockImplementation(() => undefined);

const STATS = {
  sharedStats: [stat("shared_supplies", { name: "Supplies", optionsToSacrifice: "Spend 10% Supplies to force a move.", optionsToGainAsReward: "None" })],
  playerStats: [stat("player_courage", { name: "Courage", optionsToSacrifice: "Spend 10% Courage for a bold move.", optionsToGainAsReward: "Gain 10% Courage by resting instead of pressing on." })],
};

const group = (players: number): Story => threadBeat(players, STATS);

function withLever(text: string, kind: "sacrifice" | "reward"): BeatOption[] {
  return challengeOptions().map((o, i) => (i === 2 ? { ...o, resourceType: kind, text, basePoints: kind === "sacrifice" ? 30 : -30 } : o));
}

function reply(options: Record<string, BeatOption[]>): SetOfBeatGenerationSchema {
  const beats = Object.fromEntries(Object.entries(options).map(([slot, opts]) => [slot, beatGeneration({ options: opts })]));
  return beatSet(Object.keys(options).length, beats as never);
}

describe("groupTurnReading: each rolled player's set as the game keeps it", () => {
  it("reads a lever on a player's own stat, a shared one, none, and the computed line", () => {
    const story = group(3);
    const reading = groupTurnReading(
      story,
      reply({ player1: withLever("Spend 10% Courage to leap the gap", "sacrifice"), player2: withLever("Spend 10% Supplies to force the gate", "sacrifice"), player3: challengeOptions() })
    );
    expect(reading.players.map((p) => [p.slot, p.line, p.lever, p.stat?.id, p.stat?.shared, p.stat?.allows, p.options])).toEqual([
      ["player1", "fits", "sacrifice", "player_courage", false, true, 3],
      ["player2", "fits", "sacrifice", "shared_supplies", true, true, 3],
      ["player3", "fits", undefined, undefined, undefined, undefined, 3],
    ]);
    expect(reading.sharedDropped).toBe(0);
  });

  it("counts a shared lever's later copy that the repair drops, the player left with two options", () => {
    const story = group(2);
    const reading = groupTurnReading(story, reply({ player1: withLever("Spend 10% Supplies to force the gate", "sacrifice"), player2: withLever("Spend 10% Supplies to brace the door", "sacrifice") }));
    expect(reading.sharedDropped).toBe(1);
    expect(reading.players.map((p) => [p.slot, p.lever, p.options])).toEqual([
      ["player1", "sacrifice", 3],
      ["player2", undefined, 2],
    ]);
  });

  it("reads a reward on a stat that allows none as not allowed", () => {
    const story = group(2);
    const reading = groupTurnReading(story, reply({ player1: withLever("Take a breath and gain 10% Supplies", "reward"), player2: withLever("Rest and gain 10% Courage", "reward") }));
    expect(reading.players.map((p) => [p.slot, p.lever, p.stat?.id, p.stat?.allows])).toEqual([
      ["player1", "reward", "shared_supplies", false],
      ["player2", "reward", "player_courage", true],
    ]);
  });
});

const turn = (armKey: string, caseId: string, sample: number, players: GroupTurnReading["players"], sharedDropped = 0): GroupTurnReading => ({ armKey, caseId, sample, kept: true, players, sharedDropped });
const set = (slot: string, lever?: "sacrifice" | "reward", shared = false, line: "fits" | "none" = "fits") => ({
  slot,
  line,
  ...(lever ? { lever, stat: { id: shared ? "shared_supplies" : "player_courage", name: shared ? "Supplies" : "Courage", shared, allows: true } } : {}),
  options: 3,
});

describe("groupLeverArmReadings: the variant against production under the stop rule", () => {
  const [production, variant] = GROUP_LEVERS_ARMS;
  const cases = ["a", "b", "c", "d", "e", "f"];
  const readings: GroupTurnReading[] = [
    ...cases.flatMap((c) => [1, 2].map((s) => turn(production, c, s, [set("player1"), set("player2")]))),
    ...cases.flatMap((c) => [1, 2].map((s) => turn(variant, c, s, [set("player1", "sacrifice"), set("player2", c === "a" ? "reward" : undefined, false)]))),
  ];
  const arms = groupLeverArmReadings(readings);

  it("puts production first and reads the variant against it on the pairs both have", () => {
    expect(arms.map((a) => a.armKey)).toEqual([production, variant]);
    const lever = arms[1].measures.find((m) => m.name === "leverSets");
    expect(lever?.arm).toEqual({ hits: 14, n: 24 });
    expect(lever?.reference).toEqual({ hits: 0, n: 24 });
    expect(lever?.move.moved).toBe("higher");
    expect(arms[1].measures.find((m) => m.name === "ownLeverSets")?.arm).toEqual({ hits: 14, n: 24 });
    expect(arms[1].measures.find((m) => m.name === "rewardSets")?.arm).toEqual({ hits: 2, n: 24 });
  });

  it("reads where the line gives none apart", () => {
    const none = groupLeverArmReadings([
      turn(production, "a", 1, [set("player1", undefined, false, "none")]),
      turn(production, "a", 2, [set("player1", undefined, false, "none")]),
      turn(variant, "a", 1, [set("player1", "sacrifice", false, "none")]),
      turn(variant, "a", 2, [set("player1", undefined, false, "none")]),
    ]);
    expect(none[1].measures.find((m) => m.name === "leverWhereNone")?.arm).toEqual({ hits: 1, n: 2 });
    expect(none[1].measures.find((m) => m.name === "leverWhereFits")?.arm).toEqual({ hits: 0, n: 0 });
  });

  it("renders the report's tables", () => {
    const report: GroupLeversReport = { generatedAt: new Date("2026-10-01T12:00:00Z"), tallies: [], arms, turns: readings, levers: [], keptComparisons: [], waits: { kept: [], keptBySample: [], first: [] }, spendUsd: 0.25, problems: [] };
    const md = renderGroupLevers(report);
    expect(md).toContain("# Group sacrifices, rewards and own stats (group-levers)");
    expect(md).toContain("Sets with a sacrifice or reward");
    expect(md).toContain("moved higher");
    expect(md).toContain("$0.2500");
  });

  it("reads the fix-and-retest against production and against the run's variant", () => {
    const retest = GROUP_LEVERS_ARMS[2];
    const withRetest = [...readings, ...cases.map((c) => turn(retest, c, 1, [set("player1", "sacrifice"), set("player2", "sacrifice")]))];
    const arms = groupLeverArmReadings(withRetest);
    expect(arms.map((a) => a.armKey)).toEqual([production, variant, retest]);
    // The retest ran once: its pairs with production are the first samples
    expect(arms[2].measures.find((m) => m.name === "leverSets")?.arm).toEqual({ hits: 12, n: 12 });
    expect(arms[2].measures.find((m) => m.name === "leverSets")?.reference).toEqual({ hits: 0, n: 12 });
    const retestArms = groupLeverArmReadings(withRetest.filter((r) => r.armKey !== production), variant);
    expect(retestArms[1].measures.find((m) => m.name === "leverSets")?.reference).toEqual({ hits: 7, n: 12 });
    const report: GroupLeversReport = { generatedAt: new Date("2026-10-01T12:00:00Z"), tallies: [], arms, retestArms, turns: withRetest, levers: [], keptComparisons: [], waits: { kept: [], keptBySample: [], first: [] }, spendUsd: 0.3, problems: [] };
    const md = renderGroupLevers(report);
    expect(md).toContain(`### ${retest} against ${production}`);
    expect(md).toContain(`### ${retest} against ${variant} (its second reference`);
  });
});
