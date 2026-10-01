import { describe, expect, it, jest } from "@jest/globals";
import { toJsonSchema } from "@langchain/core/utils/json_schema";
import { z } from "zod";
import { Story } from "core/models/Story.js";
import type { Beat, ThreadAnalysis } from "core/types/index.js";
import { GROUP_LEVERS_TEXT, groupLeverSlots, groupLeversBase, groupLeversRequest, takesGroupLevers } from "../../../../../src/game/services/storyTextRounds/groupLevers.js";
import { NO_DOUBLE_SACRIFICE, REWARD_EXCEPTION, sacrificeRewardLine } from "../../../../../src/game/services/optionRules.js";
import { beatStep } from "../../../../../src/game/services/storyTextSteps.js";
import { beatCheckOptions } from "../../../../../src/game/services/kidsTurnRules.js";
import { shortRepliesBase, withShortRepliesLines } from "../../../../../src/game/services/storyTextRounds/shortReplies.js";
import { groupOptionsBase } from "../../../../../src/game/services/storyTextRounds/groupOptions.js";
import { callLimitsOf, requestFor, requestText } from "../../../../../src/evals/textModelEval/variants.js";
import { productionCallLimits } from "../../../../../src/shared/llm/chatModel.js";
import { endingBeat, firstSwitchBeat, laterSwitchBeat, threadBeat } from "../../../../helpers/promptStories.js";
import { beatGeneration, challengeOptions } from "../../../../helpers/textFixtures.js";

/*
 * Group sacrifices, rewards and players' own stats (eval only; the
 * coordinator's brief of 2026-10-01). In the second round of playthroughs the
 * three group stories offered 1 sacrifice or reward in 105 option sets on
 * challenge and contest chapter steps, where B6's computed line would have
 * invited one in 103; every group player's plan answered its lever field
 * "None". A single player's same steps, with the line, offered one each of
 * the 6 times it invited one. The option rules (B6) are a single player's
 * only (takesOptionRules): a group's request has no lever line, keeps the
 * plan field's "(Many beats are better without any sacrifice or reward
 * options.)" and no reward exception. The variant is production's group turn
 * with B6's lever parts for each player in a challenge or contest thread:
 * the reward exception, each such player's computed line, a sentence on
 * shared stats (one player a turn) and the player's own stats, no second
 * sacrifice of a stat in a thread, and in those players' fields the reward
 * exception and the plan's lever question without "(Many beats …)".
 * Production's request byte for byte everywhere else. Since its
 * fix-and-retest's adoption (groupLeversB, 2026-10-01) production prints
 * those lines, so the variant builds on production with them taken out
 * (groupLeversBase), as it was measured.
 */

jest.spyOn(console, "log").mockImplementation(() => undefined);

const json = (schema: Parameters<typeof toJsonSchema>[0]) => JSON.stringify(toJsonSchema(schema));
const occurrences = (text: string, passage: string) => text.split(passage).length - 1;

/** A past challenge beat; its middle option a lever where asked. */
function challengeBeat(lever?: "sacrifice" | "reward"): Beat {
  const options = challengeOptions().map((o, i) => (i === 1 && lever ? { ...o, resourceType: lever, text: `${lever} 10% Supplies` } : o));
  return { ...beatGeneration({ options }), choice: 0, resolution: "favorable" };
}

/** A story whose players' last beats are challenge beats, with these levers on the newest of them. */
function withHistories(story: Story, levers: Record<string, ("sacrifice" | "reward" | undefined)[]>): Story {
  const state = structuredClone(story.getState());
  for (const [slot, recent] of Object.entries(levers)) {
    const history = state.players[slot].beatHistory;
    recent.forEach((lever, i) => {
      history[history.length - recent.length + i] = challengeBeat(lever);
    });
  }
  return Story.create(state);
}

/** A group's step 2 of a 3-beat thread with player1 in an exploration thread of their own beside the others' challenge. */
function mixedStep(players: number): Story {
  const story = threadBeat(players);
  const state = structuredClone(story.getState());
  const analysis = state.storyPhases[1] as ThreadAnalysis;
  const [shared] = analysis.threads;
  const results = { resolution1: "one", resolution2: "two", resolution3: "three" };
  analysis.threads = [
    {
      ...shared,
      id: "explore",
      playersSideA: ["player1"],
      possibleMilestones: results,
      progression: shared.progression.map((s, i) => ({ ...s, possibleResolutions: results, resolution: i === 0 ? ("resolution1" as const) : null })),
    },
    { ...shared, id: "fight", playersSideA: shared.playersSideA.filter((s) => s !== "player1") },
  ];
  return Story.create(state);
}

/** A group's step where every player explores. */
function explorationStep(players: number): Story {
  const story = mixedStep(players);
  const state = structuredClone(story.getState());
  const analysis = state.storyPhases[1] as ThreadAnalysis;
  analysis.threads = [{ ...analysis.threads[0], playersSideA: analysis.threads.flatMap((t) => t.playersSideA) }];
  return Story.create(state);
}

/** The variant's prompt with its insertions taken out again. */
function withoutInsertions(prompt: string, story: Story): string {
  return prompt.split(GROUP_LEVERS_TEXT.block(story)).join("").split(` ${REWARD_EXCEPTION}`).join("");
}

const shape = (schema: unknown) => (schema as z.AnyZodObject).shape;
const optionsField = (schema: unknown, slot: string) => (shape(shape(schema)[slot]).options as z.ZodTypeAny).description;
const leverField = (schema: unknown, slot: string) => {
  const union = shape(shape(schema)[slot]).plan.shape.optionConsiderations as z.ZodUnion<[z.ZodTypeAny, z.AnyZodObject]>;
  return union.options[1].shape.upToOneSacrificeOrRewardOption.description as string;
};

describe("the base the variant builds on: production's group turn as the stage measured it", () => {
  it("is production's request with the adopted group lines taken out (prompt and schema): what the second playthroughs' group turns carried", () => {
    for (const story of [threadBeat(2), threadBeat(3), mixedStep(3)]) {
      const base = groupLeversBase(story);
      const production = beatStep.request(story);
      expect(base.prompt).not.toContain(GROUP_LEVERS_TEXT.sharedAndOwn);
      expect(base.prompt).not.toContain(`${GROUP_LEVERS_TEXT.derailAnchor} ${REWARD_EXCEPTION}`);
      expect(base.prompt.length).toBeLessThan(production.prompt.length);
      expect(json(base.schema)).toContain("(Many beats are better without any sacrifice or reward options.)");
      expect(json(base.schema)).not.toContain("a reward option is the one exception");
      // Production since the adoption was the measured fix-and-retest byte for byte, with the short-replies stage's lines
      // adopted later that day (withShortRepliesLines, the measured shortReplies edit), until the group-options stage's
      // adoption that evening: production with that stage's lines taken out (groupOptionsBase) still is
      const adopted = withShortRepliesLines(groupLeversRequest(story, { b: true }));
      const beforeGroupOptions = groupOptionsBase(story);
      expect(beforeGroupOptions.prompt).toBe(adopted.prompt);
      expect(json(beforeGroupOptions.schema)).toBe(json(adopted.schema));
      expect(production.prompt).not.toBe(adopted.prompt);
    }
  });

  it("is production's request as the stage measured it, byte for byte, where no player is in a rolled group thread (without the later short-replies lines)", () => {
    for (const story of [threadBeat(1), firstSwitchBeat(2), laterSwitchBeat(3), endingBeat(2), explorationStep(2)]) {
      expect(groupLeversBase(story).prompt).toBe(shortRepliesBase(story).prompt);
      expect(json(groupLeversBase(story).schema)).toBe(json(shortRepliesBase(story).schema));
    }
  });
});

describe("which turns take the variant", () => {
  it("a group's challenge or contest chapter step: the players in a rolled thread", () => {
    expect(takesGroupLevers(threadBeat(2))).toBe(true);
    expect(groupLeverSlots(threadBeat(3))).toEqual(["player1", "player2", "player3"]);
    expect(groupLeverSlots(mixedStep(3))).toEqual(["player2", "player3"]);
    expect(takesGroupLevers(mixedStep(2))).toBe(true);
  });

  it.each([
    ["a single player's chapter step", () => threadBeat(1)],
    ["a group's first switch", () => firstSwitchBeat(2)],
    ["a group's later switch", () => laterSwitchBeat(3)],
    ["a group's ending", () => endingBeat(2)],
    ["a group's exploration step", () => explorationStep(2)],
  ])("none on %s, which is production's request (as the stage measured it) byte for byte", (_, build) => {
    const story = build();
    expect(takesGroupLevers(story)).toBe(false);
    expect(groupLeverSlots(story)).toEqual([]);
    const variant = groupLeversRequest(story);
    const production = shortRepliesBase(story);
    expect(variant.prompt).toBe(production.prompt);
    expect(json(variant.schema)).toBe(json(production.schema));
  });
});

describe("the prompt", () => {
  it.each([2, 3])("gives a group's challenge step, %i players, B6's reward exception and each player's computed line, once, and is production's otherwise", (players) => {
    const story = threadBeat(players);
    const prompt = groupLeversRequest(story).prompt;
    expect(occurrences(prompt, `${GROUP_LEVERS_TEXT.derailAnchor} ${REWARD_EXCEPTION}`)).toBe(1);
    expect(occurrences(prompt, `${GROUP_LEVERS_TEXT.leverAnchor}${GROUP_LEVERS_TEXT.block(story)}`)).toBe(1);
    expect(withoutInsertions(prompt, story)).toBe(groupLeversBase(story).prompt);
    for (const slot of groupLeverSlots(story)) {
      const line = sacrificeRewardLine(story, slot).replace("Sacrifice or reward: ", "");
      expect(prompt).toContain(`----- ${slot} (${story.getPlayer(slot)?.name}): ${line}\n`);
    }
    expect(prompt).toContain(`--- ${GROUP_LEVERS_TEXT.sharedAndOwn}\n--- ${NO_DOUBLE_SACRIFICE}\n`);
  });

  it("reads each player's own history: a lever offered in a player's last two challenge turns gives that player none, the others one, and an older one names the other kind", () => {
    const story = withHistories(threadBeat(3), { player1: [undefined, undefined, "sacrifice"], player2: ["reward", undefined, undefined], player3: [undefined, undefined, undefined] });
    const block = GROUP_LEVERS_TEXT.block(story);
    expect(block).toContain("----- player1 (Test Player 1): none this turn.\n");
    expect(block).toContain("----- player2 (Test Player 2): one fits this turn if a stat allows it (the last one offered was a reward, 3 turns ago; prefer a sacrifice).\n");
    expect(block).toContain("----- player3 (Test Player 3): one fits this turn if a stat allows it.\n");
    expect(sacrificeRewardLine(story, "player1")).toBe("Sacrifice or reward: none this turn.");
  });

  it("names only the players in a rolled thread beside one exploring", () => {
    const story = mixedStep(3);
    const block = GROUP_LEVERS_TEXT.block(story);
    expect(block).not.toContain("player1");
    expect(block).toContain("----- player2 (Test Player 2):");
    expect(block).toContain("----- player3 (Test Player 3):");
    // The exploration-order line production prints for the exploring player stays
    expect(groupLeversRequest(story).prompt).toContain("--- In an Exploration thread, a player's three options are the current step's three possible outcomes");
    expect(withoutInsertions(groupLeversRequest(story).prompt, story)).toBe(groupLeversBase(story).prompt);
  });

  it("says a shared stat's sacrifice or reward goes to one player a turn and a player's own stats come first", () => {
    expect(GROUP_LEVERS_TEXT.sharedAndOwn).toMatch(/shared stat/);
    expect(GROUP_LEVERS_TEXT.sharedAndOwn).toMatch(/one player/);
    expect(GROUP_LEVERS_TEXT.sharedAndOwn).toMatch(/own stats/);
  });
});

describe("the reply schema", () => {
  it("gives each rolled player's options field the reward exception and drops '(Many beats are better …)' from their plan's lever question", () => {
    const story = mixedStep(3);
    const variant = groupLeversRequest(story).schema;
    const production = groupLeversBase(story).schema;
    for (const slot of ["player2", "player3"]) {
      expect(optionsField(variant, slot)).toBe(
        optionsField(production, slot)?.replace("derail the core theme of the switch/thread.", "derail the core theme of the switch/thread; a reward option is the one exception.")
      );
      expect(leverField(variant, slot)).toBe(leverField(production, slot).replace(" (Many beats are better without any sacrifice or reward options.)", ""));
      expect(leverField(variant, slot)).not.toContain("Many beats");
    }
    // The exploring player's fields and everything else are production's
    expect(json(shape(variant).player1)).toBe(json(shape(production).player1));
    const rest = (schema: unknown) => json(z.object(shape(schema)).omit({ player2: true, player3: true }));
    expect(rest(variant)).toBe(rest(production));
  });
});

describe("the fix-and-retest (B): the plan's lever question follows the player's line", () => {
  it("asks each rolled player's plan for one sacrifice or reward where the line says one fits, on the player's own stats first, with the scene's reason; 'None' only where the line says none or no stat allows one", () => {
    const story = mixedStep(3);
    const a = groupLeversRequest(story);
    const b = groupLeversRequest(story, { b: true });
    for (const slot of ["player2", "player3"]) expect(leverField(b.schema, slot)).toBe(GROUP_LEVERS_TEXT.leverQuestionB);
    expect(GROUP_LEVERS_TEXT.leverQuestionB).toMatch(/line says one fits/);
    expect(GROUP_LEVERS_TEXT.leverQuestionB).toMatch(/own stats/);
    expect(GROUP_LEVERS_TEXT.leverQuestionB).toMatch(/'None' only where/);
    // Everything else is the run's variant: the prompt byte for byte, the exploring player's fields, the options field
    expect(b.prompt).toBe(a.prompt);
    expect(json(shape(b.schema).player1)).toBe(json(shape(a.schema).player1));
    for (const slot of ["player2", "player3"]) expect(optionsField(b.schema, slot)).toBe(optionsField(a.schema, slot));
    const inJson = (text: string) => JSON.stringify(text).slice(1, -1);
    const bWithAsQuestion = json(b.schema).split(inJson(GROUP_LEVERS_TEXT.leverQuestionB)).join(inJson(leverField(a.schema, "player2")));
    expect(bWithAsQuestion).toBe(json(a.schema));
  });

  it("is production's request (as the stage measured it) byte for byte where the variant applies to no one", () => {
    for (const story of [threadBeat(1), laterSwitchBeat(2), explorationStep(3), endingBeat(2)]) {
      const b = groupLeversRequest(story, { b: true });
      expect(b.prompt).toBe(shortRepliesBase(story).prompt);
      expect(json(b.schema)).toBe(json(shortRepliesBase(story).schema));
    }
  });

  it("is the eval's variant groupLeversB, with production's turn limits", () => {
    for (const story of [threadBeat(2), mixedStep(3)]) {
      const request = requestFor("groupLeversB", { role: "beat", story });
      expect(requestText(request)).toBe(groupLeversRequest(story, { b: true }).prompt);
      expect(callLimitsOf(request)).toEqual(productionCallLimits("beat", story.getNumberOfPlayers()));
    }
    expect(() => requestFor("groupLeversB", { role: "thread", story: threadBeat(2) })).toThrow(/does not cover role thread/);
  });
});

describe("the eval's variant groupLevers", () => {
  it("sends the variant with production's turn limits and production's retry count, every player count", () => {
    for (const story of [threadBeat(2), threadBeat(3), mixedStep(2), threadBeat(1), laterSwitchBeat(2)]) {
      const request = requestFor("groupLevers", { role: "beat", story });
      expect(requestText(request)).toBe(groupLeversRequest(story).prompt);
      expect(callLimitsOf(request)).toEqual(productionCallLimits("beat", story.getNumberOfPlayers()));
      const count = beatCheckOptions(story).textCount;
      expect("shortTextCount" in request ? request.shortTextCount : undefined).toBe(count);
    }
    // Production's request as the stage measured it (since the short-replies adoption, later that day, without its lines)
    expect(requestText(requestFor("groupLevers", { role: "beat", story: threadBeat(1) }))).toBe(shortRepliesBase(threadBeat(1)).prompt);
  });

  it("covers turns only", () => {
    expect(() => requestFor("groupLevers", { role: "switch", story: threadBeat(2) })).toThrow(/does not cover role switch/);
  });
});
