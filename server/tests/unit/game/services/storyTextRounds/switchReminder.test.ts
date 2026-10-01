import { describe, expect, it, jest } from "@jest/globals";
import fs from "node:fs";
import path from "node:path";
import { toJsonSchema } from "@langchain/core/utils/json_schema";
import type { Story } from "core/models/Story.js";
import { beatStep, threadStep } from "../../../../../src/game/services/storyTextSteps.js";
import { SWITCH_REMINDER, noSwitchReminderRequest } from "../../../../../src/game/services/storyTextRounds/switchReminder.js";
import { EXPLORATION_ORDER, takesExplorationOrder } from "../../../../../src/game/services/optionRules.js";
import { takesKidsRules } from "../../../../../src/game/services/kidsTurnRules.js";
import { evalFiles } from "../../../../../src/evals/textModelEval/evalFiles.js";
import { RUNAWAY_CASES } from "../../../../../src/evals/textModelEval/arms.js";
import { caseStory } from "../../../../../src/evals/textModelEval/cases.js";
import { sha256 } from "../../../../../src/evals/textModelEval/executor.js";
import { callLimitsOf, requestFor } from "../../../../../src/evals/textModelEval/variants.js";
import { endingBeat, firstSwitchBeat, laterSwitchBeat, threadAnalysisAfterSwitch, threadBeat } from "../../../../helpers/promptStories.js";
import { endedChapter, flavorSwitch, outcome, roundStory, topicSwitch } from "../../../../helpers/roundStories.js";
import { productionThen } from "../../../../helpers/adoptedDeltas.js";

/*
 * The runaway turn (2026-09-30): story 8988006e's switch turn after its first
 * chapter sometimes reasons to the output cap and writes nothing. The fix under
 * test is the turn document's B3.13 on its own: the switch configuration's
 * closing reminder ("players decided what is supposed to happen next. These
 * things have not yet happened") is the chapter planner's, which reads the
 * switch with the players' decisions; on the switch turn nobody has decided
 * yet, and after a chapter whose last choice already carried out what a flavor
 * switch's question presupposes, it tells the model that it hasn't happened.
 * The variant is production's single-player turn with that reminder cut on a
 * switch turn, and production's request byte for byte everywhere else.
 */

jest.spyOn(console, "log").mockImplementation(() => undefined);

const json = (schema: Parameters<typeof toJsonSchema>[0]) => JSON.stringify(toJsonSchema(schema));
const occurrences = (text: string, passage: string) => text.split(passage).length - 1;

const CASES_DIR = path.resolve("..", "DOCS", "2026-09-26_gpt6-text-eval");
const frozen = fs.existsSync(path.join(CASES_DIR, "cases", "cases.json")) ? evalFiles(CASES_DIR).readCases() : [];

const RING = "player1_expose_ring";
const OUTCOMES = { player1: [outcome(RING), outcome("player1_identity")] };
const DIRECTIONS: [string, string][] = [
  ["Rally the square", RING],
  ["Find your place", "player1_identity"],
  ["Press the Council", RING],
];

/** The switch turn after a chapter on the Ring, with a flavor switch whose question presupposes what the chapter's last choice did. */
const flavorAfterChapter = () =>
  roundStory({
    turns: 5,
    maxTurns: 20,
    playerOutcomes: OUTCOMES,
    phases: [
      topicSwitch(DIRECTIONS, 0),
      endedChapter(RING, 4, 1, "The evidence is found"),
      flavorSwitch(RING, "How does the player navigate the immediate fallout of exposing the Ring?", 5),
    ],
  });
const topicAfterChapter = () =>
  roundStory({ turns: 5, maxTurns: 20, playerOutcomes: OUTCOMES, phases: [topicSwitch(DIRECTIONS, 0), endedChapter(RING, 4, 1, "The evidence is found"), topicSwitch(DIRECTIONS, 5)] });

const SWITCH_TURNS: [string, () => Story][] = [
  ["the first turn", () => firstSwitchBeat(1)],
  ["a later switch", () => laterSwitchBeat(1)],
  ["a topic switch after a chapter", topicAfterChapter],
  ["a flavor switch after a chapter", flavorAfterChapter],
];

const OTHER_TURNS: [string, () => Story][] = [
  ["a chapter step", () => threadBeat(1)],
  ["the ending", () => endingBeat(1)],
];

describe("the switch configuration's reminder, as production sends it", () => {
  it.each(SWITCH_TURNS)("%s: printed once, closing the switch turn's request", (_, build) => {
    const prompt = beatStep.request(build()).prompt;
    expect(occurrences(prompt, SWITCH_REMINDER)).toBe(1);
    expect(prompt.endsWith(SWITCH_REMINDER)).toBe(true);
  });

  it("is the chapter planner's: it follows the switch with the players' decisions there", () => {
    const prompt = threadStep.request(threadAnalysisAfterSwitch(1)).prompt;
    expect(occurrences(prompt, SWITCH_REMINDER)).toBe(1);
    expect(prompt.indexOf("PLAYER DECISIONS:")).toBeGreaterThan(-1);
    expect(prompt.indexOf("PLAYER DECISIONS:")).toBeLessThan(prompt.indexOf(SWITCH_REMINDER));
  });

  it("is the text the turn document's B3.13 names", () => {
    expect(SWITCH_REMINDER).toBe(
      "\n\nRemember: In these switches, players decided what is supposed to happen next. These things have not yet happened. The current thread and beat must make sure that the story actually continues based on the players' choices.\n"
    );
  });
});

describe("noSwitchReminderRequest: production's single-player turn without the reminder on a switch turn", () => {
  it.each(SWITCH_TURNS)("%s: production's request with the reminder cut, and nothing else (production as it stood before the short-replies adoption of 2026-10-01)", (_, build) => {
    const story = build();
    const [ours, production] = [noSwitchReminderRequest(story), productionThen(beatStep.request(story), story)];
    expect(ours.prompt).toBe(production.prompt.replace(SWITCH_REMINDER, ""));
    expect(ours.prompt).not.toContain("These things have not yet happened");
    expect(ours.prompt.endsWith("\n- Relationship to other switches: single-player\n")).toBe(true);
    expect(json(ours.schema)).toBe(json(production.schema));
  });

  it.each(OTHER_TURNS)("%s: production's request byte for byte (an ending as it stood before the owner's decision of 2026-10-01 on ending milestones)", (_, build) => {
    const story = build();
    const [ours, production] = [noSwitchReminderRequest(story), productionThen(beatStep.request(story), story)];
    expect(ours.prompt).toBe(production.prompt);
    expect(json(ours.schema)).toBe(json(production.schema));
  });

  it("is single-player: the runaway turn is one player's", () => {
    const group = roundStory({ players: 2, turns: 0, maxTurns: 20, phases: [topicSwitch(DIRECTIONS, 0, ["player1", "player2"])] });
    expect(() => noSwitchReminderRequest(group)).toThrow(/single-player/);
  });

  it("goes out as the eval's variant with production's single-player turn limits", () => {
    const request = requestFor("noSwitchReminder", { role: "beat", story: flavorAfterChapter() });
    expect(callLimitsOf(request)).toEqual({ timeoutMs: 90_000, maxCompletionTokens: 12_000 });
    expect(() => requestFor("noSwitchReminder", { role: "switch", story: flavorAfterChapter() })).toThrow(/does not cover role switch/);
  });

  (frozen.length ? it : it.skip)("every frozen single-player turn: switch turns differ from production by the reminder alone, every other turn byte for byte (an exploration step as production sent it when the fix ran)", () => {
    const cases = frozen.filter((c) => c.role === "beat" && !c.tags.multiplayer);
    expect(cases.length).toBeGreaterThan(40);
    let switchTurns = 0;
    for (const c of cases) {
      const story = caseStory(c);
      // A single player's read-with-kids turn takes the kids rules since 2026-10-01, which the fix, measured before them,
      // doesn't: production as it stood then read no category
      const then = takesKidsRules(story) ? story.clone({ category: undefined, readingAge: undefined }) : story;
      // An ending as it stood before the owner's decision of 2026-10-01 on ending milestones, which the fix ran before
      const [ours, production] = [noSwitchReminderRequest(story), productionThen(beatStep.request(then), then)];
      // Since the choice-line-sp adoption (2026-09-30) a single player's exploration step carries the exploration-order
      // line, which the fix, measured before it, doesn't
      const sent = takesExplorationOrder(story) ? production.prompt.replace(EXPLORATION_ORDER, "") : production.prompt;
      const expected = story.getCurrentBeatType() === "switch" ? sent.replace(SWITCH_REMINDER, "") : sent;
      if (story.getCurrentBeatType() === "switch") switchTurns++;
      expect({ id: c.id, same: ours.prompt === expected }).toEqual({ id: c.id, same: true });
      expect(json(ours.schema)).toBe(json(production.schema));
    }
    expect(switchTurns).toBeGreaterThan(5);
  });

  (frozen.length ? it : it.skip)("the runaway case: production's request, as it stood before the short-replies adoption of 2026-10-01, is the one that ran away on 30 September, byte for byte", () => {
    const [runaway] = RUNAWAY_CASES;
    const story = caseStory(frozen.find((c) => c.id === runaway)!);
    expect(story.getCurrentBeatType()).toBe("switch");
    expect(sha256(productionThen(beatStep.request(story), story).prompt)).toBe("25faaf999fd9ea330a3175bb9cfcb7452afefd56328d3f01d224c21041c68b43");
    expect(sha256(noSwitchReminderRequest(story).prompt)).not.toBe(sha256(beatStep.request(story).prompt));
  });
});
