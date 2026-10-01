import { describe, expect, it, jest } from "@jest/globals";
import { toJsonSchema } from "@langchain/core/utils/json_schema";
import { z } from "zod";
import { Story } from "core/models/Story.js";
import type { Beat, BeatOption, Stat, StoryPhase, ThreadAnalysis } from "core/types/index.js";
import {
  GROUP_OPTIONS_TEXT,
  groupOptionsBase,
  groupOptionsLine,
  groupOptionsRequest,
  groupOptionsRule,
  groupRateLine,
  groupRewardTurn,
} from "../../../../../src/game/services/storyTextRounds/groupOptions.js";
import { GROUP_LEVERS_TEXT } from "../../../../../src/game/services/storyTextRounds/groupLevers.js";
import { GROUP_LEVER_QUESTION, groupLeverLine, groupLeverSlots, sacrificeRewardLine } from "../../../../../src/game/services/optionRules.js";
import { OPTIONS_CONTINUITY_TEXT } from "../../../../../src/game/services/storyTextRounds/turnOptionsContinuity.js";
import { OPTIONS_O2C_TEXT } from "../../../../../src/game/services/storyTextRounds/optionsO2c.js";
import { beatStep } from "../../../../../src/game/services/storyTextSteps.js";
import { beatCheckOptions } from "../../../../../src/game/services/kidsTurnRules.js";
import { callLimitsOf, requestFor, requestText } from "../../../../../src/evals/textModelEval/variants.js";
import { productionCallLimits } from "../../../../../src/shared/llm/chatModel.js";
import { endingBeat, firstSwitchBeat, laterSwitchBeat, threadBeat } from "../../../../helpers/promptStories.js";
import { endedChapter, outcome, roundStory } from "../../../../helpers/roundStories.js";
import { beatGeneration, challengeOptions, stat, switchAnalysis, threadAnalysis } from "../../../../helpers/textFixtures.js";

/*
 * The owner's option rules for group turns (eval only; the coordinator's brief
 * of 2026-10-01 evening, decision A): one reward a chapter, a strong reason for
 * a second sacrifice, options on different stats and not only risk. They reach
 * a single player's rolled step since the options-o2c stage; a group's rolled
 * players kept B6's rate line, which never looks at chapters (in the third
 * playthroughs a group reward came off a chapter's first step, or in the
 * chapter after one, 8 times in 14), and a group's sets carry none of O2b's
 * variety lines (95 of 103 rolled group sets failed primaryStatsDistinct, 78
 * had two options only risk tells apart). The variant is production's group
 * turn with, on a group's rolled step, each rolled player's line computed per
 * player and chapter as O2c computes a single player's (the reward turn the
 * game places, a sacrifice on B6's rate, a second only for a strong reason,
 * none where the owner's roll discards the player's), O2b's stat lines for each
 * player's options, and the plan's lever question asked from those lines.
 */

jest.spyOn(console, "log").mockImplementation(() => undefined);

const json = (schema: Parameters<typeof toJsonSchema>[0]) => JSON.stringify(toJsonSchema(schema));
const occurrences = (text: string, passage: string) => text.split(passage).length - 1;

const NERVE = stat("player_nerve", { name: "Nerve", optionsToSacrifice: "Spend 10% Nerve to push through", optionsToGainAsReward: "Regain 10% Nerve by stopping to catch your breath" });
const COIN = stat("player_coin", { name: "Coin", optionsToSacrifice: "Spend 5 Coin on a bribe", optionsToGainAsReward: "None" });

/** A challenge beat of a player's history with this lever as its second option, the first option chosen (or the lever, `took`). */
function challengeBeat(lever?: BeatOption["resourceType"], took = false): Beat {
  const options = challengeOptions().map((o, i) => (i === 1 && lever ? { ...o, resourceType: lever, text: `${lever} 10% Nerve` } : o));
  return { ...beatGeneration({ options }), choice: took ? 1 : 0, resolution: "favorable" };
}
const switchBeat = (): Beat => ({ ...beatGeneration(), choice: 0, resolution: null });

const slotsOf = (n: number) => Array.from({ length: n }, (_, i) => `player${i + 1}`);

/**
 * A group story whose current chapter (every player in one challenge thread on `outcomeId`, `duration` steps) began at
 * history index `first`; where `first` > 1, one ended chapter (history 1 to first - 2) and its switch before it.
 */
function groupStory(histories: Beat[][], first: number, options: { duration?: number; stats?: Stat[]; outcomeId?: string; ownOutcomes?: Record<string, string[]> } = {}): Story {
  const players = histories.length;
  const slots = slotsOf(players);
  const { duration = 3, stats = [NERVE], outcomeId = "shared_goal" } = options;
  const turns = histories[0].length;
  const analysis = threadAnalysis("challenge", duration, first, slots);
  const done = turns - first;
  const chapter: ThreadAnalysis = {
    ...analysis,
    threads: analysis.threads.map((t) => ({ ...t, outcomeId, progression: t.progression.map((step, i) => ({ ...step, resolution: i < done ? ("favorable" as const) : null })) })),
  };
  const phases: StoryPhase[] =
    first === 1 ? [switchAnalysis(slots, 0), chapter] : [switchAnalysis(slots, 0), endedChapter("shared_goal", first - 2, 1, "Done", slots), switchAnalysis(slots, first - 1), chapter];
  const playerOutcomes = Object.fromEntries(Object.entries(options.ownOutcomes ?? {}).map(([slot, ids]) => [slot, ids.map((id) => outcome(id))]));
  const story = roundStory({ players, turns, maxTurns: 20, phases, sharedOutcomes: [outcome("shared_goal")], playerOutcomes });
  const state = story.getState();
  const withHistories = Object.fromEntries(slots.map((slot, i) => [slot, { ...state.players[slot], beatHistory: histories[i] }]));
  return Story.create({ ...state, playerStats: stats, players: withHistories });
}

/** Two players at a chapter's first step after a first chapter (history 1-2) with these levers on its two steps, per player. */
function secondChapterOpening(levers: [BeatOption["resourceType"] | undefined, BeatOption["resourceType"] | undefined][], stats: Stat[] = [NERVE]): Story {
  return groupStory(
    levers.map(([a, b]) => [switchBeat(), challengeBeat(a), challengeBeat(b), switchBeat()]),
    4,
    { stats }
  );
}

const shape = (schema: unknown) => (schema as z.AnyZodObject).shape;
const leverField = (schema: unknown, slot: string) => {
  const union = shape(shape(schema)[slot]).plan.shape.optionConsiderations as z.ZodUnion<[z.ZodTypeAny, z.AnyZodObject]>;
  return union.options[1].shape.upToOneSacrificeOrRewardOption.description as string;
};

/** A group's step 2 of a 3-beat thread with player1 exploring beside the others' challenge (production's mixed step). */
function mixedStep(players: number): Story {
  const story = threadBeat(players);
  const state = structuredClone(story.getState());
  const analysis = state.storyPhases[1] as ThreadAnalysis;
  const [shared] = analysis.threads;
  const results = { resolution1: "one", resolution2: "two", resolution3: "three" };
  analysis.threads = [
    { ...shared, id: "explore", playersSideA: ["player1"], possibleMilestones: results, progression: shared.progression.map((s, i) => ({ ...s, possibleResolutions: results, resolution: i === 0 ? ("resolution1" as const) : null })) },
    { ...shared, id: "fight", playersSideA: shared.playersSideA.filter((s) => s !== "player1") },
  ];
  return Story.create({ ...state, playerStats: [NERVE] });
}

const explorationStep = (players: number): Story => {
  const story = mixedStep(players);
  const state = structuredClone(story.getState());
  const analysis = state.storyPhases[1] as ThreadAnalysis;
  analysis.threads = [{ ...analysis.threads[0], playersSideA: analysis.threads.flatMap((t) => t.playersSideA) }];
  return Story.create(state);
};

/** The variant's prompt with its edits undone: its base's prompt (production as the stage measured it), if it changed nothing else. */
function withoutEdits(prompt: string, story: Story): string {
  let undone = prompt.replace(`${GROUP_OPTIONS_TEXT.diversionAnchor}${GROUP_OPTIONS_TEXT.variety}`, GROUP_OPTIONS_TEXT.diversionAnchor);
  for (const slot of groupLeverSlots(story)) {
    const name = story.getPlayer(slot)?.name;
    const head = `----- ${slot}${name ? ` (${name})` : ""}: `;
    undone = undone.replace(`${head}${groupOptionsLine(story, slot).replace("Sacrifice or reward: ", "")}\n`, `${head}${groupRateLine(story, slot).replace("Sacrifice or reward: ", "")}\n`);
  }
  return undone;
}

describe("the reward turn: a group's rolled player gets the chapter's one reward where the game places it", () => {
  it("is a group chapter's first step, where that player's previous chapter offered no reward and a stat allows one, whatever B6's rate says", () => {
    // The story's first chapter
    const first = groupStory([[switchBeat()], [switchBeat()]], 1);
    expect(slotsOf(2).map((slot) => groupRewardTurn(first, slot))).toEqual([true, true]);
    // After a chapter that offered only a sacrifice (B6's rate gives none: a lever two rolled turns back)
    const afterSacrifice = secondChapterOpening([
      [undefined, "sacrifice"],
      [undefined, undefined],
    ]);
    expect(sacrificeRewardLine(afterSacrifice, "player1")).toBe("Sacrifice or reward: none this turn.");
    expect(groupRewardTurn(afterSacrifice, "player1")).toBe(true);
    expect(groupOptionsRule(afterSacrifice, "player1")).toEqual({ reward: true, sacrifice: "none" });
    expect(groupOptionsLine(afterSacrifice, "player1")).toBe(OPTIONS_O2C_TEXT.rewardTurn);
  });

  it("never for a player whose previous chapter offered a reward, chosen or not, so never two chapters running; the other player still gets theirs", () => {
    const story = secondChapterOpening([
      [undefined, "reward"],
      [undefined, undefined],
    ]);
    expect(groupRewardTurn(story, "player1")).toBe(false);
    expect(groupRewardTurn(story, "player2")).toBe(true);
    // player1's last rolled turn offered a reward: B6's rate gives none, and so does the line
    expect(groupOptionsLine(story, "player1")).toBe("Sacrifice or reward: none this turn.");
    // A reward on the first of the previous chapter's three steps: B6's rate fits (preferring a sacrifice), the line a
    // sacrifice and no reward
    const older = groupStory(
      [
        [switchBeat(), challengeBeat("reward"), challengeBeat(), challengeBeat(), switchBeat()],
        [switchBeat(), challengeBeat(), challengeBeat(), challengeBeat(), switchBeat()],
      ],
      5
    );
    expect(sacrificeRewardLine(older, "player1")).toMatch(/prefer a sacrifice/);
    expect(groupOptionsRule(older, "player1")).toEqual({ reward: false, sacrifice: "fits" });
    expect(groupOptionsLine(older, "player1")).toBe(OPTIONS_O2C_TEXT.sacrificeFits);
  });

  it("never on a chapter's later steps, nor where no stat allows a reward", () => {
    const later = groupStory([[switchBeat(), challengeBeat()], [switchBeat(), challengeBeat()]], 1);
    expect(groupRewardTurn(later, "player1")).toBe(false);
    expect(groupOptionsLine(later, "player1")).toBe(OPTIONS_O2C_TEXT.sacrificeFits);
    const noReward = groupStory([[switchBeat()], [switchBeat()]], 1, { stats: [COIN] });
    expect(groupRewardTurn(noReward, "player1")).toBe(false);
    expect(groupOptionsLine(noReward, "player1")).toBe(OPTIONS_O2C_TEXT.sacrificeFits);
  });

  it("never on a turn whose group options aren't rolled, nor for a single player (O2c's own line)", () => {
    for (const story of [firstSwitchBeat(2), laterSwitchBeat(3), endingBeat(2), threadBeat(1)]) expect(groupRewardTurn(story, "player1")).toBe(false);
    expect(groupRewardTurn(mixedStep(3), "player1")).toBe(false);
  });
});

describe("groupOptionsRule and groupOptionsLine: per player and chapter", () => {
  it("elsewhere no reward: a sacrifice where B6's rate fits, a second in the chapter only for a strong reason, none where the rate gives none", () => {
    // The last step of a four-step chapter: player1 was offered a sacrifice on step 1 (and took it), player2 nothing
    const story = groupStory(
      [
        [switchBeat(), challengeBeat("sacrifice", true), challengeBeat(), challengeBeat()],
        [switchBeat(), challengeBeat(), challengeBeat(), challengeBeat()],
      ],
      1,
      { duration: 4 }
    );
    expect(sacrificeRewardLine(story, "player1")).toMatch(/one fits this turn if a stat allows it \(the last one offered was a sacrifice/);
    expect(groupOptionsRule(story, "player1")).toEqual({ reward: false, sacrifice: "strongReason" });
    expect(groupOptionsLine(story, "player1")).toBe(
      `Sacrifice or reward: this thread already offered a sacrifice, which the player took, ${OPTIONS_O2C_TEXT.strongReason}. No reward this turn.`
    );
    expect(groupOptionsRule(story, "player2")).toEqual({ reward: false, sacrifice: "fits" });
    // The step after a lever: none, as B6's rate
    const after = groupStory([[switchBeat(), challengeBeat("sacrifice")], [switchBeat(), challengeBeat("reward")]], 1);
    for (const slot of slotsOf(2)) {
      expect(groupOptionsRule(after, slot)).toEqual({ reward: false, sacrifice: "none" });
      expect(groupOptionsLine(after, slot)).toBe("Sacrifice or reward: none this turn.");
    }
  });

  it("none for a player whose roll the step discards (another player's own outcome, its owner in the thread), the owner keeping theirs", () => {
    const story = groupStory([[switchBeat()], [switchBeat()]], 1, { outcomeId: "player2_protege", ownOutcomes: { player2: ["player2_protege"] } });
    expect(groupLeverLine(story, "player1")).toBe("Sacrifice or reward: none this turn.");
    expect(groupOptionsRule(story, "player1")).toEqual({ reward: false, sacrifice: "none", ownersRoll: true });
    expect(groupOptionsLine(story, "player1")).toBe("Sacrifice or reward: none this turn.");
    expect(groupOptionsRule(story, "player2")).toEqual({ reward: true, sacrifice: "none" });
  });
});

describe("the prompt", () => {
  it.each([2, 3])("on a group's rolled step, %i players: O2b's stat lines once after the option examples, each rolled player's line, and production's request otherwise", (players) => {
    const story = groupStory(
      slotsOf(players).map(() => [switchBeat()]),
      1
    );
    const prompt = groupOptionsRequest(story).prompt;
    expect(occurrences(prompt, `${GROUP_OPTIONS_TEXT.diversionAnchor}${GROUP_OPTIONS_TEXT.variety}`)).toBe(1);
    for (const slot of slotsOf(players)) expect(prompt).toContain(`----- ${slot} (${story.getPlayer(slot)?.name}): ${OPTIONS_O2C_TEXT.rewardTurn.replace("Sacrifice or reward: ", "")}\n`);
    expect(prompt).not.toContain("prefer a");
    expect(withoutEdits(prompt, story)).toBe(groupOptionsBase(story).prompt);
  });

  it("names only the players in a rolled thread beside one exploring, each with their own line", () => {
    const story = mixedStep(3);
    const prompt = groupOptionsRequest(story).prompt;
    expect(prompt).not.toContain("----- player1");
    for (const slot of ["player2", "player3"]) expect(prompt).toContain(`----- ${slot} (${story.getPlayer(slot)?.name}): ${groupOptionsLine(story, slot).replace("Sacrifice or reward: ", "")}\n`);
    expect(withoutEdits(prompt, story)).toBe(groupOptionsBase(story).prompt);
  });

  it.each([
    ["a single player's chapter step", () => threadBeat(1)],
    ["a group's first switch", () => firstSwitchBeat(2)],
    ["a group's later switch", () => laterSwitchBeat(3)],
    ["a group's ending", () => endingBeat(2)],
    ["a group's exploration step", () => explorationStep(2)],
  ])("is production's request byte for byte on %s, and so is its base", (_, build) => {
    const story = build();
    const variant = groupOptionsRequest(story);
    const production = beatStep.request(story);
    expect(variant.prompt).toBe(production.prompt);
    expect(json(variant.schema)).toBe(json(production.schema));
    expect(groupOptionsBase(story).prompt).toBe(production.prompt);
  });

  it("carries O2b's stat lines and risk-only example word for word, under a lead for a group's rolled players", () => {
    const [lead, stats, negativeBase, riskOnly] = GROUP_OPTIONS_TEXT.variety.trimEnd().split("\n");
    expect(lead).toBe("- In a Challenge or Contest thread, each player's three options draw on different stats:");
    expect(stats).toBe(OPTIONS_CONTINUITY_TEXT.o2Stats.replace("--- The options also draw on different stats: no two", "--- No two"));
    expect(negativeBase).toBe(OPTIONS_CONTINUITY_TEXT.o2NegativeBase);
    expect(riskOnly).toBe(OPTIONS_CONTINUITY_TEXT.riskOnlyWeak);
  });

  it("is production's request byte for byte since its adoption; its base is production with the adopted lines taken out, as the stage measured beside it", () => {
    for (const story of [threadBeat(2), mixedStep(3), groupStory([[switchBeat()], [switchBeat()]], 1), endingBeat(2), threadBeat(1)]) {
      const production = beatStep.request(story);
      expect(groupOptionsRequest(story).prompt).toBe(production.prompt);
      expect(json(groupOptionsRequest(story).schema)).toBe(json(production.schema));
    }
    for (const story of [threadBeat(2), mixedStep(3)]) {
      const base = groupOptionsBase(story).prompt;
      expect(base).not.toContain(GROUP_OPTIONS_TEXT.variety);
      for (const slot of groupLeverSlots(story)) expect(base).toContain(`): ${groupRateLine(story, slot).replace("Sacrifice or reward: ", "")}\n`);
      // The pre-adoption line: B6's rate, none for a roll the step discards (groupLeversB's, with production's delta)
      for (const slot of groupLeverSlots(story)) expect(groupRateLine(story, slot)).toBe(sacrificeRewardLine(story, slot));
    }
    for (const story of [endingBeat(2), threadBeat(1), explorationStep(2)]) expect(groupOptionsBase(story).prompt).toBe(beatStep.request(story).prompt);
  });
});

describe("the reply schema", () => {
  it("asks each rolled player's plan its lever question from the new lines (production's since the adoption); the base groupLeversB's question; every other field production's", () => {
    const story = mixedStep(3);
    const variant = groupOptionsRequest(story).schema;
    const base = groupOptionsBase(story).schema;
    for (const slot of ["player2", "player3"]) {
      expect(leverField(variant, slot)).toBe(GROUP_OPTIONS_TEXT.leverQuestion);
      expect(leverField(variant, slot)).toBe(GROUP_LEVER_QUESTION);
      expect(leverField(base, slot)).toBe(GROUP_LEVERS_TEXT.leverQuestionB);
    }
    const inJson = (text: string) => JSON.stringify(text).slice(1, -1);
    expect(json(variant).split(inJson(GROUP_OPTIONS_TEXT.leverQuestion)).join(inJson(GROUP_LEVERS_TEXT.leverQuestionB))).toBe(json(base));
    expect(json(shape(variant).player1)).toBe(json(shape(base).player1));
  });

  it("asks for a second sacrifice only where the scene gives a strong reason, and 'None' where the line says none", () => {
    expect(GROUP_OPTIONS_TEXT.leverQuestion).toMatch(/offers a reward or says a sacrifice fits/);
    expect(GROUP_OPTIONS_TEXT.leverQuestion).toMatch(/only for a strong reason, describe one only if this scene gives such a reason/);
    expect(GROUP_OPTIONS_TEXT.leverQuestion).toMatch(/Say 'None' where the line says none this turn, or where no stat allows one\.$/);
  });
});

describe("the eval's variant groupOptions", () => {
  it("sends the variant with production's turn limits and production's retry count", () => {
    for (const story of [threadBeat(2), mixedStep(3), threadBeat(1), laterSwitchBeat(2)]) {
      const request = requestFor("groupOptions", { role: "beat", story });
      expect(requestText(request)).toBe(groupOptionsRequest(story).prompt);
      expect(callLimitsOf(request)).toEqual(productionCallLimits("beat", story.getNumberOfPlayers()));
      const count = beatCheckOptions(story).textCount;
      expect("shortTextCount" in request ? request.shortTextCount : undefined).toBe(count);
    }
  });

  it("covers turns only", () => {
    expect(() => requestFor("groupOptions", { role: "switch", story: threadBeat(2) })).toThrow(/does not cover role switch/);
  });
});
