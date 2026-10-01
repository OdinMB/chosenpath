import { describe, expect, it, jest } from "@jest/globals";
import { toJsonSchema } from "@langchain/core/utils/json_schema";
import { z } from "zod";
import type { Story } from "core/models/Story.js";
import type { StoryState } from "core/types/index.js";
import { SHORT_REPLIES_TEXT, shortRepliesRequest } from "../../../../../src/game/services/storyTextRounds/shortReplies.js";
import { beatStep } from "../../../../../src/game/services/storyTextSteps.js";
import { beatCheckOptions } from "../../../../../src/game/services/kidsTurnRules.js";
import { callLimitsOf, requestFor, requestText } from "../../../../../src/evals/textModelEval/variants.js";
import { productionCallLimits } from "../../../../../src/shared/llm/chatModel.js";
import { endingBeat, firstSwitchBeat, laterSwitchBeat, threadBeat } from "../../../../helpers/promptStories.js";

/*
 * Turns that come back as one short paragraph (eval only; the coordinator's
 * brief of 2026-10-01 after the second playthroughs: 13 of 126 first replies
 * one short paragraph, 2 of them short again after production's retry). Every
 * short text in the eval's stored replies is exactly one ordinary first
 * paragraph (147 of 147 texts, 53-96 words) and none has two to four
 * paragraphs (18 of 4,564 texts have three or four), so the reply closes its
 * text where the first paragraph break would go; in a group the later players'
 * texts follow the first player's (31 of 34 short group replies short for
 * every player). The variant is production's turn, every turn kind and player
 * count, with one line in the text rules and one in each player's text field
 * saying the text goes on after its first paragraph, a blank line between
 * paragraphs. Production's request byte for byte otherwise.
 */

jest.spyOn(console, "log").mockImplementation(() => undefined);

const json = (schema: Parameters<typeof toJsonSchema>[0]) => JSON.stringify(toJsonSchema(schema));
const inJson = (text: string) => JSON.stringify(text).slice(1, -1);
const occurrences = (text: string, passage: string) => text.split(passage).length - 1;
const kids = (min: number, max = min): Partial<StoryState> => ({ category: "read-with-kids", kidAges: { min, max } });

const TURNS: [string, () => Story][] = [
  ["a single player's first turn", () => firstSwitchBeat(1)],
  ["a single player's chapter step (the option rules)", () => threadBeat(1)],
  ["a single player's switch turn after a chapter", () => laterSwitchBeat(1)],
  ["a single player's ending", () => endingBeat(1)],
  ["a group's first turn", () => firstSwitchBeat(2)],
  ["a group's chapter step (the group's levers)", () => threadBeat(2)],
  ["a three-player switch turn", () => laterSwitchBeat(3)],
  ["a group's ending", () => endingBeat(3)],
  ["a turn with generated images", () => threadBeat(1, { generateImages: true })],
  ["a template's turn with its image library", () => laterSwitchBeat(2, { templateId: "tpl-x" })],
  ["a read-with-kids turn at 4", () => threadBeat(1, kids(4))],
  ["a read-with-kids group turn at 10", () => laterSwitchBeat(2, kids(10))],
  ["a read-with-kids turn with no age", () => endingBeat(1, { category: "read-with-kids" })],
];

const players = (schema: unknown) => Object.entries((schema as z.AnyZodObject).shape).filter(([key]) => /^player\d+$/.test(key)) as [string, z.AnyZodObject][];
const textField = (player: z.AnyZodObject) => (player.shape.text as z.ZodString).description ?? "";

describe("the prompt: one line after the first paragraph's rules", () => {
  it.each(TURNS)("%s: the line once, right before the text rules' show-don't-tell bullet, and production's prompt byte for byte without it", (_, build) => {
    const story = build();
    const variant = shortRepliesRequest(story).prompt;
    const production = beatStep.request(story).prompt;
    expect(occurrences(variant, SHORT_REPLIES_TEXT.promptLine)).toBe(1);
    expect(occurrences(variant, `\n${SHORT_REPLIES_TEXT.promptLine}\n- Show, don't tell.\n`)).toBe(1);
    // It comes after the first paragraph's rules, in the instructions before the story state
    expect(variant.indexOf(SHORT_REPLIES_TEXT.promptLine)).toBeGreaterThan(variant.indexOf("- The first paragraph must"));
    expect(variant.indexOf(SHORT_REPLIES_TEXT.promptLine)).toBeLessThan(variant.indexOf("======= CURRENT GAME STATE ======="));
    expect(variant.split(`${SHORT_REPLIES_TEXT.promptLine}\n`).join("")).toBe(production);
  });
});

describe("the reply schema: one line in each player's text field", () => {
  it.each(TURNS)("%s: every player's text field carries it once, before its first rule after the count; production's schema byte for byte without it", (_, build) => {
    const story = build();
    const variant = shortRepliesRequest(story).schema;
    const production = beatStep.request(story).schema;
    const slots = players(variant);
    expect(slots.map(([slot]) => slot)).toEqual(players(production).map(([slot]) => slot));
    for (const [, player] of slots) {
      const description = textField(player);
      expect(occurrences(description, SHORT_REPLIES_TEXT.fieldLine)).toBe(1);
      expect(occurrences(description, `${SHORT_REPLIES_TEXT.fieldLine}${SHORT_REPLIES_TEXT.fieldAnchor}`)).toBe(1);
    }
    expect(json(variant).split(inJson(SHORT_REPLIES_TEXT.fieldLine)).join("")).toBe(json(production));
  });

  it("keeps slots that share one schema instance sharing one, as production's do", () => {
    for (const story of [firstSwitchBeat(3), threadBeat(2), endingBeat(2), laterSwitchBeat(3, kids(4))]) {
      const variant = players(shortRepliesRequest(story).schema).map(([, p]) => p);
      const production = players(beatStep.request(story).schema).map(([, p]) => p);
      for (let i = 1; i < production.length; i++) expect(variant[i] === variant[0]).toBe(production[i] === production[0]);
    }
  });
});

describe("the lines' words", () => {
  it("say the text goes on after its first paragraph, a blank line between paragraphs, and name no count (every band reads its own)", () => {
    for (const line of [SHORT_REPLIES_TEXT.promptLine, SHORT_REPLIES_TEXT.fieldLine]) {
      expect(line).toMatch(/never ends after its first paragraph/);
      expect(line).toMatch(/blank line/);
      expect(line).not.toMatch(/\d/);
    }
    // The field names the break as the reply's JSON string writes it
    expect(SHORT_REPLIES_TEXT.fieldLine).toContain("(\\n\\n)");
    expect(SHORT_REPLIES_TEXT.fieldLine.endsWith("\n")).toBe(true);
    expect(SHORT_REPLIES_TEXT.promptLine.startsWith("- ")).toBe(true);
  });
});

describe("the eval's variant shortReplies", () => {
  it("sends the variant with production's turn limits and production's retry count, every player count", () => {
    for (const [, build] of TURNS) {
      const story = build();
      const request = requestFor("shortReplies", { role: "beat", story });
      expect(requestText(request)).toBe(shortRepliesRequest(story).prompt);
      expect(callLimitsOf(request)).toEqual(productionCallLimits("beat", story.getNumberOfPlayers()));
      expect("shortTextCount" in request ? request.shortTextCount : undefined).toBe(beatCheckOptions(story).textCount);
    }
  });

  it("covers turns only", () => {
    expect(() => requestFor("shortReplies", { role: "thread", story: threadBeat(2) })).toThrow(/does not cover role thread/);
  });
});
