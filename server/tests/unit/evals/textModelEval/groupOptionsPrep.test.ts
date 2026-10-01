import { describe, expect, it, jest } from "@jest/globals";
import { Story } from "core/models/Story.js";
import type { Beat, BeatOption, SetOfBeatGenerationSchema, StoryPhase, ThreadAnalysis } from "core/types/index.js";
import {
  GROUP_OPTIONS_ARMS,
  groupOptionsArmReadings,
  groupOptionsTurnReading,
  renderGroupOptions,
  type GroupOptionsReport,
  type GroupOptionsTurn,
  type GroupSetReading,
} from "../../../../src/evals/textModelEval/groupOptionsPrep.js";
import { endedChapter, outcome, roundStory } from "../../../helpers/roundStories.js";
import { beatGeneration, beatSet, challengeOptions, stat, switchAnalysis, threadAnalysis } from "../../../helpers/textFixtures.js";

/*
 * The group-options stage's readings (decision A, the evening of 2026-10-01):
 * each kept group turn read per rolled player, as the game keeps it (the beat
 * repairs), against the owner's rules for that player (groupOptionsRule: the
 * reward turn, a sacrifice that fits, a second only for a strong reason, none)
 * and B6's rate (production's line): the lever the set carries and its stat, a
 * second sacrifice in the chapter, the owner's variety (main stats distinct,
 * two options only risk tells apart) and the odds; then per arm, against
 * production under the stop rule.
 */

jest.spyOn(console, "log").mockImplementation(() => undefined);

const COURAGE = stat("player_courage", { name: "Courage", optionsToSacrifice: "Spend 10% Courage for a bold move.", optionsToGainAsReward: "Gain 10% Courage by resting instead of pressing on." });
const SUPPLIES = stat("shared_supplies", { name: "Supplies", optionsToSacrifice: "Spend 10% Supplies to force a move.", optionsToGainAsReward: "None" });

const switchBeat = (): Beat => ({ ...beatGeneration(), choice: 0, resolution: null });
function challengeBeat(lever?: BeatOption["resourceType"], took = false): Beat {
  const options = challengeOptions().map((o, i) => (i === 1 && lever ? { ...o, resourceType: lever, text: `${lever} 10% Courage` } : o));
  return { ...beatGeneration({ options }), choice: took ? 1 : 0, resolution: "favorable" };
}

/** A group story in its current chapter (every player in one challenge thread on `outcomeId`) from history index `first`. */
function groupStory(histories: Beat[][], first: number, options: { duration?: number; outcomeId?: string; ownOutcomes?: Record<string, string[]> } = {}): Story {
  const slots = histories.map((_, i) => `player${i + 1}`);
  const { duration = 3, outcomeId = "shared_goal" } = options;
  const turns = histories[0].length;
  const analysis = threadAnalysis("challenge", duration, first, slots);
  const chapter: ThreadAnalysis = {
    ...analysis,
    threads: analysis.threads.map((t) => ({ ...t, outcomeId, progression: t.progression.map((step, i) => ({ ...step, resolution: i < turns - first ? ("favorable" as const) : null })) })),
  };
  const phases: StoryPhase[] =
    first === 1 ? [switchAnalysis(slots, 0), chapter] : [switchAnalysis(slots, 0), endedChapter("shared_goal", first - 2, 1, "Done", slots), switchAnalysis(slots, first - 1), chapter];
  const playerOutcomes = Object.fromEntries(Object.entries(options.ownOutcomes ?? {}).map(([slot, ids]) => [slot, ids.map((id) => outcome(id))]));
  const story = roundStory({ players: slots.length, turns, maxTurns: 20, phases, sharedOutcomes: [outcome("shared_goal")], playerOutcomes });
  const state = story.getState();
  return Story.create({ ...state, sharedStats: [SUPPLIES], playerStats: [COURAGE], players: Object.fromEntries(slots.map((slot, i) => [slot, { ...state.players[slot], beatHistory: histories[i] }])) });
}

type Bonus = { statId: string; reason: string; effect: number };
const bonus = (statId: string, effect: number): Bonus => ({ statId, reason: "fits", effect });
function options(levers: { kind?: "sacrifice" | "reward"; text?: string } = {}, bonuses: Bonus[][] = [[], [], []]): BeatOption[] {
  return challengeOptions().map((o, i) => ({
    ...o,
    modifiersToSuccessRate: bonuses[i],
    ...(i === 2 && levers.kind ? { resourceType: levers.kind, text: levers.text ?? "", basePoints: levers.kind === "sacrifice" ? 30 : -30 } : {}),
  }));
}
function reply(sets: Record<string, BeatOption[]>): SetOfBeatGenerationSchema {
  const beats = Object.fromEntries(Object.entries(sets).map(([slot, opts]) => [slot, beatGeneration({ options: opts })]));
  return beatSet(Object.keys(sets).length, beats as never);
}

describe("groupOptionsTurnReading: each rolled player's set against the owner's rules and B6's rate", () => {
  it("reads a chapter's first step as each player's reward turn: a reward there, a sacrifice there, and their stats", () => {
    const story = groupStory([[switchBeat()], [switchBeat()]], 1);
    const reading = groupOptionsTurnReading(
      story,
      reply({
        player1: options({ kind: "reward", text: "Rest a moment and gain 10% Courage" }, [[bonus("player1_courage", 10)], [bonus("shared_supplies", 10)], []]),
        player2: options({ kind: "sacrifice", text: "Spend 10% Courage to leap the gap" }, [[bonus("player2_courage", 10)], [bonus("player2_courage", 10)], []]),
      })
    );
    expect(reading.sets.map((s) => [s.slot, s.rule, s.rate, s.lever, s.stat?.id, s.stat?.shared, s.stat?.allows, s.variety?.statsDistinct, s.variety?.onlyRisk, s.options])).toEqual([
      ["player1", "reward", "fits", "reward", "player_courage", false, true, true, false, 3],
      ["player2", "reward", "fits", "sacrifice", "player_courage", false, true, false, true, 3],
    ]);
    for (const s of reading.sets) {
      expect(s.chances).toHaveLength(3);
      expect(s.secondSacrifice).toBe(false);
    }
  });

  it("reads a second sacrifice in the chapter, with and without a reason in its text, and B6's preference", () => {
    // The last step of a four-step chapter whose first offered each player a sacrifice
    const histories = [0, 1].map(() => [switchBeat(), challengeBeat("sacrifice", true), challengeBeat(), challengeBeat()]);
    const story = groupStory(histories, 1, { duration: 4 });
    const reading = groupOptionsTurnReading(
      story,
      reply({
        player1: options({ kind: "sacrifice", text: "Spend 10% Courage because the bridge falls in a minute" }),
        player2: options({ kind: "sacrifice", text: "Spend 10% Courage to push on" }),
      })
    );
    expect(reading.sets.map((s) => [s.slot, s.rule, s.rate, s.prefers, s.secondSacrifice, s.unreasoned])).toEqual([
      ["player1", "strongReason", "fits", "reward", true, false],
      ["player2", "strongReason", "fits", "reward", true, true],
    ]);
  });

  it("reads a sacrifice or reward written as a normal option at its points (the game counts them and charges nothing)", () => {
    const story = groupStory([[switchBeat(), challengeBeat()], [switchBeat(), challengeBeat()]], 1);
    const asNormal = challengeOptions().map((o, i) => (i === 1 ? { ...o, basePoints: 30, text: "Hold steady through the shaking (-10% Courage)." } : o));
    const reading = groupOptionsTurnReading(story, reply({ player1: asNormal, player2: options({ kind: "sacrifice", text: "Spend 10% Courage to leap the gap" }) }));
    expect(reading.sets.map((s) => [s.slot, s.lever, s.leverAsNormal])).toEqual([
      ["player1", undefined, true],
      ["player2", "sacrifice", false],
    ]);
  });

  it("reads a player whose roll the step discards apart, and a shared lever's later copy the repairs drop", () => {
    const story = groupStory([[switchBeat()], [switchBeat()]], 1, { outcomeId: "player2_own", ownOutcomes: { player2: ["player2_own"] } });
    const reading = groupOptionsTurnReading(
      story,
      reply({ player1: options({ kind: "sacrifice", text: "Spend 10% Supplies to force the gate" }), player2: options({ kind: "sacrifice", text: "Spend 10% Supplies to brace the door" }) })
    );
    expect(reading.sets.map((s) => [s.slot, s.rule, s.rate, s.lever, s.options])).toEqual([
      ["player1", "ownersRoll", "none", "sacrifice", 3],
      ["player2", "reward", "fits", undefined, 2],
    ]);
    expect(reading.sharedDropped).toBe(1);
  });
});

const turn = (armKey: string, caseId: string, sample: number, sets: Partial<GroupSetReading>[], reasoningTokens = 100): GroupOptionsTurn => ({
  armKey,
  caseId,
  sample,
  kept: true,
  sharedDropped: 0,
  reasoningTokens,
  sets: sets.map((s, i) => ({ slot: `player${i + 1}`, rule: "fits", rate: "fits", secondSacrifice: false, unreasoned: false, leverAsNormal: false, options: 3, ...s })),
});

describe("groupOptionsArmReadings: the variant against production under the stop rule", () => {
  const [production, variant] = GROUP_OPTIONS_ARMS;
  const cases = ["a", "b", "c", "d", "e", "f", "g", "h"];
  const readings: GroupOptionsTurn[] = [
    // Production: a reward wherever B6 invites one, on the reward turn or not; the same stat on every option
    ...cases.flatMap((c) =>
      [1, 2].map((s) =>
        turn(production, c, s, [
          { rule: "reward", lever: "reward", variety: { statsDistinct: false, leverApart: false, onlyRisk: true } },
          { rule: "fits", lever: "reward", variety: { statsDistinct: false, leverApart: false, onlyRisk: true } },
        ])
      )
    ),
    // The variant: a reward on the reward turn only, a sacrifice elsewhere; stats distinct
    ...cases.flatMap((c) =>
      [1, 2].map((s) =>
        turn(
          variant,
          c,
          s,
          [
            { rule: "reward", lever: "reward", variety: { statsDistinct: true, leverApart: true, onlyRisk: false } },
            { rule: "fits", lever: "sacrifice", variety: { statsDistinct: true, leverApart: true, onlyRisk: false } },
          ],
          130
        )
      )
    ),
  ];
  const arms = groupOptionsArmReadings(readings);
  const measure = (name: string) => arms[1].measures.find((m) => m.name === name);

  it("puts production first and reads the variant against it on the pairs both have", () => {
    expect(arms.map((a) => a.armKey)).toEqual([production, variant]);
    expect(measure("rewardOffRewardTurn")?.reference).toEqual({ hits: 16, n: 16 });
    expect(measure("rewardOffRewardTurn")?.arm).toEqual({ hits: 0, n: 16 });
    expect(measure("rewardOffRewardTurn")?.move.moved).toBe("lower");
    expect(measure("rewardOnRewardTurn")?.arm).toEqual({ hits: 16, n: 16 });
    expect(measure("statsDistinct")?.move.moved).toBe("higher");
    expect(measure("onlyRisk")?.move.moved).toBe("lower");
    expect(arms[1].reasoning.arm.mean).toBe(130);
    expect(arms[1].reasoning.reference.mean).toBe(100);
  });

  it("renders the report's tables", () => {
    const report: GroupOptionsReport = {
      generatedAt: new Date("2026-10-01T22:00:00Z"),
      tallies: [],
      arms,
      turns: readings,
      levers: [],
      keptComparisons: [],
      waits: { kept: [], keptBySample: [], first: [] },
      spendUsd: 0.29,
      problems: [],
    };
    const md = renderGroupOptions(report);
    expect(md).toContain("# The owner's option rules for group turns (group-options)");
    expect(md).toContain("Rewards off the reward turn");
    expect(md).toContain("moved lower");
    expect(md).toContain("$0.2900");
  });
});
