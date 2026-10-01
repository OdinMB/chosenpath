import { describe, expect, it, jest } from "@jest/globals";
import fs from "node:fs";
import path from "node:path";
import { toJsonSchema } from "@langchain/core/utils/json_schema";
import { Story } from "core/models/Story.js";
import type { Beat, StoryPhase, ThreadAnalysis } from "core/types/index.js";
import { beatStep } from "../../../../../src/game/services/storyTextSteps.js";
import { takesKidsRules } from "../../../../../src/game/services/kidsTurnRules.js";
import { CHOICE_RESULT_TEXT, choiceResultRequest, productionTurnToday, takesExplorationOrder } from "../../../../../src/game/services/storyTextRounds/choiceResult.js";
import { evalFiles } from "../../../../../src/evals/textModelEval/evalFiles.js";
import { caseStory } from "../../../../../src/evals/textModelEval/cases.js";
import { callLimitsOf, requestFor, requestText } from "../../../../../src/evals/textModelEval/variants.js";
import { productionCallLimits } from "../../../../../src/shared/llm/chatModel.js";
import { endingBeat, firstSwitchBeat, laterSwitchBeat, slotsOf, threadBeat } from "../../../../helpers/promptStories.js";
import { createMockMultiplayerStory, createMockStory } from "../../../../helpers/testHelpers.js";
import { beatGeneration, switchAnalysis, thread, threadAnalysis } from "../../../../helpers/textFixtures.js";
import { productionThen } from "../../../../helpers/adoptedDeltas.js";

/*
 * The choice-result stage's turn (2026-09-30, the playthroughs' "choices that
 * lead somewhere else"): on an exploration step the game records option n as
 * the step's result n, but production's turn is shown the step's three
 * results with nothing saying so, and wrote options that carry out another
 * result, or none (New Avalon turns 6 and 14, lemonade turn 6, food trucks
 * turns 14 and 17). The variant is production's turn with one line on an
 * exploration step: each option is its own result, the same action in the
 * same direction, and the text carries out none of them. Everywhere else it
 * is production's request byte for byte; the base is built from the frozen
 * copy through the measured forms, and a test holds it to production (at an
 * ending, production as it stood before the owner's decision of 2026-10-01 on
 * ending milestones: productionThen, adoptedDeltas.ts).
 */

jest.spyOn(console, "log").mockImplementation(() => undefined);

const json = (schema: Parameters<typeof toJsonSchema>[0]) => JSON.stringify(toJsonSchema(schema));
const occurrences = (text: string, passage: string) => text.split(passage).length - 1;

const CASES_DIR = path.resolve("..", "DOCS", "2026-09-26_gpt6-text-eval");
const frozen = fs.existsSync(path.join(CASES_DIR, "cases", "cases.json")) ? evalFiles(CASES_DIR).readCases() : [];

/** A past beat per turn, the last one's option chosen. */
function history(turns: number): Beat[] {
  return Array.from({ length: turns }, (_, i) => ({ ...beatGeneration({ text: `beat ${i}`, summary: `summary ${i}` }), choice: 0, resolution: "resolution1" as const }));
}

function storyWith(players: number, turns: number, phases: StoryPhase[]): Story {
  const base = (players > 1 ? createMockMultiplayerStory(players) : createMockStory()).getState();
  const withHistory = Object.fromEntries(Object.entries(base.players).map(([slot, player]) => [slot, { ...player, beatHistory: history(turns) }]));
  return Story.create({ ...base, players: withHistory, storyPhases: phases });
}

/** Step `done + 1` of a 3-beat thread from history index 2, every earlier step resolved, one thread for everyone or one per player. */
function chapterStep(players: number, kinds: ("exploration" | "challenge")[], done: number): Story {
  const slots = slotsOf(players);
  const threads = kinds.length === 1 ? [thread(kinds[0], 3, 2, slots)] : kinds.map((kind, i) => ({ ...thread(kind, 3, 2, [slots[i]]), id: `thread_${i}` }));
  const analysis: ThreadAnalysis = {
    ...threadAnalysis(kinds[0], 3, 2, slots),
    threads: threads.map((t) => ({
      ...t,
      progression: t.progression.map((step, i) => ({ ...step, resolution: i < done ? ("favorable" in step.possibleResolutions ? ("favorable" as const) : ("resolution1" as const)) : null })),
    })),
  };
  return storyWith(players, 2 + done, [switchAnalysis(slots, 1), analysis]);
}

const OTHER_TURNS: [string, () => Story][] = [
  ["a first turn", () => firstSwitchBeat(1)],
  ["a challenge step", () => threadBeat(1)],
  ["a challenge chapter's first step", () => chapterStep(1, ["challenge"], 0)],
  ["a switch after a chapter", () => laterSwitchBeat(1)],
  ["the ending", () => endingBeat(1)],
  ["a group's first turn", () => firstSwitchBeat(2)],
  ["a group's challenge step", () => threadBeat(3)],
  ["a group's switch after a chapter", () => laterSwitchBeat(2)],
  ["a group's ending", () => endingBeat(2)],
];

const SINGLE_EXPLORATION_STEPS: [string, () => Story][] = [
  ["a single player's exploration chapter's first step", () => chapterStep(1, ["exploration"], 0)],
  ["a single player's exploration step after the first", () => chapterStep(1, ["exploration"], 1)],
];

const GROUP_EXPLORATION_STEPS: [string, () => Story][] = [
  ["a group's shared exploration step", () => chapterStep(2, ["exploration"], 1)],
  ["a group where one player explores and one takes a challenge", () => chapterStep(2, ["exploration", "challenge"], 0)],
];

const EXPLORATION_STEPS = [...SINGLE_EXPLORATION_STEPS, ...GROUP_EXPLORATION_STEPS];

/**
 * Whether production sends the exploration line on this turn: every exploration step, a group's since the stage's
 * adoption, a single player's since the choice-line-sp stage (2026-09-30).
 */
const productionTakesLine = (story: Story) => takesExplorationOrder(story);

describe("productionTurnToday: production's turn as the eval measured it before the stage, built from the frozen copy", () => {
  it.each(OTHER_TURNS)("is production's request byte for byte on %s, prompt and schema", (_, make) => {
    const story = make();
    const [ours, production] = [productionTurnToday(story), productionThen(beatStep.request(story), story)];
    expect(ours.prompt).toBe(production.prompt);
    expect(json(ours.schema)).toBe(json(production.schema));
  });

  // Adopted for group turns (the choice-result run of 2026-09-30), then for a single player (the choice-line-sp run of
  // the same day): production's exploration step is the variant as measured
  it.each(EXPLORATION_STEPS)("is production's request without the adopted exploration line on %s, and production is the variant", (_, make) => {
    const story = make();
    const [ours, variant, production] = [productionTurnToday(story), choiceResultRequest(story), beatStep.request(story)];
    expect(production.prompt).toBe(variant.prompt);
    expect(production.prompt.replace(CHOICE_RESULT_TEXT.explorationOrder, "")).toBe(ours.prompt);
    expect(json(ours.schema)).toBe(json(production.schema));
  });

  (frozen.length ? it : it.skip)("is production's request byte for byte on every frozen turn case, the variant's on an exploration step", () => {
    // A single player's read-with-kids turn is the kids turn since 2026-10-01 (adoptedTurns and adoptedForms hold it)
    const turns = frozen.filter((c) => c.role === "beat" && c.state && !takesKidsRules(caseStory(c)));
    expect(turns.length).toBeGreaterThan(50);
    for (const c of turns) {
      const story = caseStory(c);
      const measured = productionTakesLine(story) ? choiceResultRequest(story) : productionTurnToday(story);
      const production = productionThen(beatStep.request(story), story);
      expect([c.id, measured.prompt === production.prompt, json(measured.schema) === json(production.schema)]).toEqual([c.id, true, true]);
    }
  });
});

describe("choiceResultRequest: an exploration step's options are its results, in order", () => {
  it("adds the one line after the option types on an exploration step, and nothing else", () => {
    for (const [, make] of EXPLORATION_STEPS) {
      const story = make();
      const [ours, base] = [choiceResultRequest(story), productionTurnToday(story)];
      expect(takesExplorationOrder(story)).toBe(true);
      expect(occurrences(ours.prompt, CHOICE_RESULT_TEXT.explorationOrder)).toBe(1);
      expect(ours.prompt.replace(CHOICE_RESULT_TEXT.explorationOrder, "")).toBe(base.prompt);
      // Right after the option-type lines, before the resource types
      expect(ours.prompt).toContain(`${CHOICE_RESULT_TEXT.optionTypes}${CHOICE_RESULT_TEXT.explorationOrder}\n- Define if the option is a sacrifice`);
      expect(json(ours.schema)).toBe(json(base.schema));
    }
  });

  it("says each option is its own result, the same action in the same direction, why, and that the text carries out none", () => {
    const line = CHOICE_RESULT_TEXT.explorationOrder;
    expect(line).toMatch(/option 1 is Resolution 1, option 2 is Resolution 2 and option 3 is Resolution 3/);
    expect(line).toMatch(/the same action in the same direction/);
    expect(line).toMatch(/records the chosen option's resolution as what the player did/);
    expect(line).toMatch(/carries out none of them/);
    // Model-facing vocabulary: thread and beat
    expect(line).not.toMatch(/chapter|turn\b/i);
  });

  it.each(OTHER_TURNS)("is production's request byte for byte on %s", (_, make) => {
    const story = make();
    const [ours, production] = [choiceResultRequest(story), productionThen(beatStep.request(story), story)];
    expect(takesExplorationOrder(story)).toBe(false);
    expect(ours.prompt).toBe(production.prompt);
    expect(json(ours.schema)).toBe(json(production.schema));
  });

  it("carries production's turn limits for the player count as the eval sends it, and covers turns only", () => {
    const single = requestFor("choiceResult", { role: "beat", story: chapterStep(1, ["exploration"], 0) });
    expect(callLimitsOf(single)).toEqual(productionCallLimits("beat", 1));
    expect(callLimitsOf(requestFor("choiceResult", { role: "beat", story: chapterStep(2, ["exploration"], 0) }))).toEqual(productionCallLimits("beat", 2));
    expect(() => requestFor("choiceResult", { role: "thread", story: chapterStep(1, ["exploration"], 0) })).toThrow(/does not cover role thread/);
  });

  it("has its one fix-and-retest (choiceResultB): the same line with its last sentence asking for the full text, in the same place, nothing else changed", () => {
    // The run of 2026-09-30: 3 of the variant's 20 single-player replies came back as one short paragraph (none of
    // production's), each having narrated the last choice and stopped
    const { explorationOrder, explorationOrderFullText } = CHOICE_RESULT_TEXT;
    expect(explorationOrder.endsWith("The beat text leads up to the three and carries out none of them.\n")).toBe(true);
    expect(explorationOrderFullText.endsWith("The beat text is written in full as always (5-6 paragraphs that set up the moment) and carries out none of the three: the player's option does.\n")).toBe(true);
    const cut = (line: string) => line.slice(0, line.indexOf("The beat text"));
    expect(cut(explorationOrderFullText)).toBe(cut(explorationOrder));
    for (const [, make] of EXPLORATION_STEPS) {
      const story = make();
      const [fixed, first] = [choiceResultRequest(story, { fullText: true }), choiceResultRequest(story)];
      expect(fixed.prompt).toBe(first.prompt.replace(explorationOrder, explorationOrderFullText));
      expect(json(fixed.schema)).toBe(json(first.schema));
    }
    for (const [, make] of OTHER_TURNS) expect(choiceResultRequest(make(), { fullText: true }).prompt).toBe(productionThen(beatStep.request(make()), make()).prompt);
    const single = requestFor("choiceResultB", { role: "beat", story: chapterStep(1, ["exploration"], 0) });
    expect(requestText(single)).toBe(choiceResultRequest(chapterStep(1, ["exploration"], 0), { fullText: true }).prompt);
    expect(callLimitsOf(single)).toEqual(productionCallLimits("beat", 1));
    expect(() => requestFor("choiceResultB", { role: "switch", story: chapterStep(1, ["exploration"], 0) })).toThrow(/does not cover role switch/);
  });

  (frozen.length ? it : it.skip)("changes only the exploration steps among the frozen turn cases", () => {
    for (const c of frozen.filter((f) => f.role === "beat" && f.state)) {
      const story = caseStory(c);
      const [ours, base] = [choiceResultRequest(story), productionTurnToday(story)];
      const changed = ours.prompt !== base.prompt;
      expect([c.id, changed]).toEqual([c.id, takesExplorationOrder(story)]);
    }
  });
});
