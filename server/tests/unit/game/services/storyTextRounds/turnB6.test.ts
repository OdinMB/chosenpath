import { describe, expect, it } from "@jest/globals";
import { toJsonSchema } from "@langchain/core/utils/json_schema";
import type { Story } from "core/models/Story.js";
import type { ThreadAnalysis } from "core/types/index.js";
import { beatStep } from "../../../../../src/game/services/storyTextSteps.js";
import { TURN_ROUND2_TEXT, todaysFormWithB6Request } from "../../../../../src/game/services/storyTextRounds/turnRound2.js";
import { endedChapter, outcome, roundStory, topicSwitch } from "../../../../helpers/roundStories.js";
import { threadAnalysis, type ThreadKind } from "../../../../helpers/textFixtures.js";
import { countOf, descriptionsOf, find } from "../storyTextRewrite/rewriteChecks.js";

/*
 * Today's turn form with the option rules (B6) alone: the one turn change
 * that passed the stop rule (turn round 2), which the setup-to-play chain of
 * setup round 3 runs on its own for the first time. Only challenge and
 * contest chapter steps change; every other turn is today's request.
 */

const GUILD = "player1_guild_reform";
const ENCLAVE = "player1_enclave_trust";
const OUTCOMES = { player1: [outcome(GUILD, { milestones: ["Sir Bram listened"] }), outcome(ENCLAVE)] };
const DIRECTIONS: [string, string][] = [
  ["Petition the Guild", GUILD],
  ["Win over the enclave", ENCLAVE],
  ["Print the pamphlet", GUILD],
];

const occurrences = (text: string, passage: string) => text.split(passage).length - 1;
const json = (schema: Parameters<typeof toJsonSchema>[0]) => toJsonSchema(schema) as Record<string, unknown>;
const descriptions = (schema: Parameters<typeof toJsonSchema>[0]) => descriptionsOf(toJsonSchema(schema)).join("\n");

function chapterStep(kind: ThreadKind, done: number, duration = 3): Story {
  const analysis = threadAnalysis(kind, duration, 1);
  const chapter: ThreadAnalysis = {
    ...analysis,
    threads: analysis.threads.map((t) => ({
      ...t,
      outcomeId: GUILD,
      progression: t.progression.map((step, i) => ({ ...step, resolution: i < done ? (kind === "exploration" ? ("resolution1" as const) : ("favorable" as const)) : null })),
    })),
  };
  return roundStory({ turns: 1 + done, maxTurns: 20, playerOutcomes: OUTCOMES, phases: [topicSwitch(DIRECTIONS, 0), chapter] });
}

const firstTurn = () => roundStory({ turns: 0, maxTurns: 20, playerOutcomes: OUTCOMES, phases: [topicSwitch(DIRECTIONS, 0)] });
const switchAfterChapter = () =>
  roundStory({ turns: 5, maxTurns: 20, playerOutcomes: OUTCOMES, phases: [topicSwitch(DIRECTIONS, 0), endedChapter(GUILD, 4, 1, "The Guild hears the petition"), topicSwitch(DIRECTIONS, 5)] });
const ending = () =>
  roundStory({
    turns: 6,
    maxTurns: 6,
    playerOutcomes: OUTCOMES,
    phases: [topicSwitch(DIRECTIONS, 0), endedChapter(GUILD, 2, 1, "The Guild hears the petition"), topicSwitch(DIRECTIONS, 3), endedChapter(ENCLAVE, 2, 4, "The enclave sends Gruk")],
  });

describe("today's turn form with B6 alone", () => {
  it.each([
    ["challenge opening", () => chapterStep("challenge", 0)],
    ["challenge step", () => chapterStep("challenge", 1)],
    ["challenge last step", () => chapterStep("challenge", 2)],
  ] as const)("%s: B6's lines once each, production's base points and licence gone", (_name, make) => {
    const { prompt } = todaysFormWithB6Request(make());
    for (const line of [TURN_ROUND2_TEXT.threeWaysStart, TURN_ROUND2_TEXT.rewardException, TURN_ROUND2_TEXT.noDoubleSacrifice, "Sacrifice or reward: "]) {
      expect({ line, found: occurrences(prompt, line) }).toEqual({ line, found: 1 });
    }
    expect(prompt).not.toContain("That said: if it makes sense for a stat to have an influence");
    expect(prompt).not.toContain("--- basePoints:");
  });

  it("puts base points and at most two bonuses in their fields, and lets a reward turn aside", () => {
    const request = todaysFormWithB6Request(chapterStep("challenge", 1));
    const text = descriptions(request.schema);
    expect(occurrences(text, TURN_ROUND2_TEXT.basePoints)).toBe(1);
    expect(occurrences(text, TURN_ROUND2_TEXT.bonuses)).toBe(1);
    expect(text).not.toContain("Many beats are better without any sacrifice or reward options");
    expect(text).toContain("derail the core theme of the switch/thread; a reward option is the one exception.");
    const modifiers = find(json(request.schema), ["properties", "player1", "properties", "options", "items", "anyOf", "1", "properties", "modifiersToSuccessRate"]);
    expect(countOf(modifiers)).toEqual({ maxItems: 2 });
  });

  it("carries none of turn round 2's other changes (B3, B5, B7, B8)", () => {
    const request = todaysFormWithB6Request(chapterStep("challenge", 1));
    const text = `${request.prompt}\n${descriptions(request.schema)}`;
    for (const other of [TURN_ROUND2_TEXT.proseStyleStart, TURN_ROUND2_TEXT.lastParagraphStart, TURN_ROUND2_TEXT.hooksStart, TURN_ROUND2_TEXT.certainLever, TURN_ROUND2_TEXT.bonusEffect, TURN_ROUND2_TEXT.fourthWallStart]) {
      expect({ other, found: occurrences(text, other) }).toEqual({ other, found: 0 });
    }
    // Everything else is today's request: undo B6's instruction edits and the rest is production's prompt
    const production = beatStep.request(chapterStep("challenge", 1)).prompt;
    expect(request.prompt.length).toBeGreaterThan(production.length);
    expect(request.prompt.slice(request.prompt.indexOf("======= CURRENT GAME STATE ======="))).toBe(production.slice(production.indexOf("======= CURRENT GAME STATE =======")));
  });

  it.each([
    ["first turn", firstTurn],
    ["switch after a chapter", switchAfterChapter],
    ["exploration step", () => chapterStep("exploration", 1)],
    ["ending", ending],
  ] as const)("%s: no lever to offer, so today's request exactly", (_name, make) => {
    const story = make();
    const [ours, theirs] = [todaysFormWithB6Request(story), beatStep.request(story)];
    expect(ours.prompt).toBe(theirs.prompt);
    expect(JSON.stringify(json(ours.schema))).toBe(JSON.stringify(json(theirs.schema)));
  });

  it("is single-player: group turns stay on today's form (the group round, B10, did not run)", () => {
    const group = roundStory({ players: 2, turns: 0, maxTurns: 20, phases: [topicSwitch(DIRECTIONS, 0, ["player1", "player2"])] });
    expect(() => todaysFormWithB6Request(group)).toThrow(/single-player/);
  });
});
