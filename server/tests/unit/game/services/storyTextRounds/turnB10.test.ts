import { describe, expect, it } from "@jest/globals";
import { toJsonSchema } from "@langchain/core/utils/json_schema";
import type { Story } from "core/models/Story.js";
import type { ThreadAnalysis } from "core/types/index.js";
// B10 edits production's group turn as it stood at the round0 prompt state
import { round0BeatStep } from "../../../../../src/game/services/storyTextRound0/round0Steps.js";
import { B10B_COORDINATION_NOTE, B10_COORDINATION_NOTE, TODAYS_COORDINATION_QUESTION, groupTurnB10Request } from "../../../../../src/game/services/storyTextRounds/turnRound3Groups.js";
import { outcome, roundStory, topicSwitch } from "../../../../helpers/roundStories.js";
import { threadAnalysis, type ThreadKind } from "../../../../helpers/textFixtures.js";

/*
 * B10, the group turn round (turn doc B10; the owner's feedback workflow of
 * 2026-09-28): today's group turn with the multiplayer coordination note
 * sharpened, in the prompt's coordination step and in the note's own field.
 * "Other beats" stays (turn round 3: it carries real facts between the
 * players' turns on GPT-6), and so does everything else.
 */

const SHARED = "shared_guild_reform";
const PLAYERS = ["player1", "player2"];
const DIRECTIONS: [string, string][] = [
  ["Petition the Guild", SHARED],
  ["Win over the enclave", SHARED],
  ["Print the pamphlet", SHARED],
];

const occurrences = (text: string, passage: string) => text.split(passage).length - 1;
const json = (schema: Parameters<typeof toJsonSchema>[0]) => toJsonSchema(schema) as { properties: Record<string, { description?: string }> };

const firstTurn = (players = 2) =>
  roundStory({ players, turns: 0, maxTurns: 20, sharedOutcomes: [outcome(SHARED)], phases: [topicSwitch(DIRECTIONS, 0, PLAYERS.slice(0, players))] });

function chapterStep(kind: ThreadKind, done: number): Story {
  const analysis = threadAnalysis(kind, 3, 1, PLAYERS);
  const chapter: ThreadAnalysis = {
    ...analysis,
    threads: analysis.threads.map((t) => ({
      ...t,
      outcomeId: SHARED,
      progression: t.progression.map((step, i) => ({ ...step, resolution: i < done ? ("favorable" as const) : null })),
    })),
  };
  return roundStory({ players: 2, turns: 1 + done, maxTurns: 20, sharedOutcomes: [outcome(SHARED)], phases: [topicSwitch(DIRECTIONS, 0, PLAYERS), chapter] });
}

const CASES = [
  ["two-player first turn", () => firstTurn(2)],
  ["three-player first turn", () => firstTurn(3)],
  ["chapter opening step", () => chapterStep("challenge", 0)],
  ["later contest step", () => chapterStep("contest", 1)],
] as const;

describe("B10: the sharpened coordination note on group turns", () => {
  it("asks for the shared moments word for word, each player's part, the shared facts, and options that work alone", () => {
    for (const part of ["word for word", "each player's part of the scene", "the facts every turn must agree on", "Every option must work whatever the other players choose"]) {
      expect(B10_COORDINATION_NOTE).toContain(part);
    }
  });

  it.each(CASES)("%s: the note replaces today's question in the coordination step, once", (_name, make) => {
    const { prompt } = groupTurnB10Request(make());
    expect(occurrences(prompt, B10_COORDINATION_NOTE)).toBe(1);
    expect(prompt).not.toContain(TODAYS_COORDINATION_QUESTION);
    // The note sits in the coordination step, before the beats are written
    expect(prompt.indexOf(B10_COORDINATION_NOTE)).toBeGreaterThan(prompt.indexOf("3. MULTIPLAYER COORDINATION"));
    expect(prompt.indexOf(B10_COORDINATION_NOTE)).toBeLessThan(prompt.indexOf("4. GENERATE ONE STORY BEAT FOR EACH PLAYER"));
  });

  it.each(CASES)("%s: the note is the coordination field's description, in the field's own place", (_name, make) => {
    const story = make();
    const [ours, todays] = [json(groupTurnB10Request(story).schema), json(round0BeatStep.request(story).schema)];
    expect(ours.properties.multiplayerCoordination.description).toBe(B10_COORDINATION_NOTE);
    expect(Object.keys(ours.properties)).toEqual(Object.keys(todays.properties));
  });

  it.each(CASES)("%s: otherwise today's group turn exactly, other beats and its block included", (_name, make) => {
    const story = make();
    const [ours, todays] = [groupTurnB10Request(story), round0BeatStep.request(story)];
    expect(ours.prompt.replace(B10_COORDINATION_NOTE, TODAYS_COORDINATION_QUESTION)).toBe(todays.prompt);
    expect(ours.prompt).toContain("How to stay consistent?");
    const [a, b] = [json(ours.schema), json(todays.schema)];
    const todaysDescription = b.properties.multiplayerCoordination.description;
    a.properties.multiplayerCoordination.description = todaysDescription;
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(a)).toContain("otherBeats");
  });

  it.each(CASES)("%s: the retest (B10b) asks for the shared moment's script and its own close per turn, otherwise B10 exactly", (_name, make) => {
    const story = make();
    const [retest, first] = [groupTurnB10Request(story, "script"), groupTurnB10Request(story)];
    for (const part of ["Speaker: \"words\"", "and only these", "you say", "at most four lines", "which is where that turn ends"]) {
      expect(B10B_COORDINATION_NOTE).toContain(part);
    }
    expect(occurrences(retest.prompt, B10B_COORDINATION_NOTE)).toBe(1);
    expect(retest.prompt.replace(B10B_COORDINATION_NOTE, B10_COORDINATION_NOTE)).toBe(first.prompt);
    const [a, b] = [json(retest.schema), json(first.schema)];
    expect(a.properties.multiplayerCoordination.description).toBe(B10B_COORDINATION_NOTE);
    a.properties.multiplayerCoordination.description = B10_COORDINATION_NOTE;
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("is for groups only: a single player's turn has no coordination note", () => {
    const single = roundStory({ turns: 0, maxTurns: 20, playerOutcomes: { player1: [outcome("player1_guild")] }, phases: [topicSwitch([["Petition the Guild", "player1_guild"]], 0)] });
    expect(() => groupTurnB10Request(single)).toThrow(/group/);
  });
});
