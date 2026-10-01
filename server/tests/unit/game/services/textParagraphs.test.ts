import { describe, expect, it, jest } from "@jest/globals";
import { z } from "zod";
import type { Story } from "core/models/Story.js";
import type { StoryState } from "core/types/index.js";
import { TEXT_GOES_ON, TEXT_GOES_ON_FIELD, beatSchemaWithTextGoesOn } from "../../../../src/game/services/textParagraphs.js";
import { SHORT_REPLIES_TEXT } from "../../../../src/game/services/storyTextRounds/shortReplies.js";
import { beatStep } from "../../../../src/game/services/storyTextSteps.js";
import { endingBeat, firstSwitchBeat, laterSwitchBeat, threadBeat } from "../../../helpers/promptStories.js";

/*
 * A turn's text goes on after its first paragraph (the short-replies stage of
 * 2026-10-01, measured as the eval's shortReplies and adopted): every turn, every
 * player count and form, carries one line in its text rules (after the first
 * paragraph's rules, before "- Show, don't tell.") and one in each player's
 * text field (after its count, before "- Start exactly where …"). A short text
 * in the eval's stored replies was always exactly its first paragraph: the reply
 * closed its text where the first paragraph break would go.
 */

jest.spyOn(console, "log").mockImplementation(() => undefined);

const kids = (min: number): Partial<StoryState> => ({ category: "read-with-kids", kidAges: { min, max: min } });
const FIELD_ANCHOR = "- Start exactly where the previous beat for this player ended.\n";
const occurrences = (text: string, passage: string) => text.split(passage).length - 1;
const players = (schema: unknown) => Object.entries((schema as z.AnyZodObject).shape).filter(([key]) => /^player\d+$/.test(key)) as [string, z.AnyZodObject][];
const textField = (player: z.AnyZodObject) => (player.shape.text as z.ZodString).description ?? "";

const TURNS: [string, () => Story][] = [
  ["a single player's first turn", () => firstSwitchBeat(1)],
  ["a single player's chapter step", () => threadBeat(1)],
  ["a single player's switch turn", () => laterSwitchBeat(1)],
  ["a single player's ending", () => endingBeat(1)],
  ["a group's first turn", () => firstSwitchBeat(3)],
  ["a group's chapter step", () => threadBeat(2)],
  ["a group's switch turn", () => laterSwitchBeat(2)],
  ["a group's ending", () => endingBeat(2)],
  ["a turn with generated images", () => threadBeat(1, { generateImages: true })],
  ["a read-with-kids turn at 4", () => threadBeat(1, kids(4))],
  ["a read-with-kids group switch turn at 10", () => laterSwitchBeat(3, kids(10))],
];

describe("production's lines are the measured variant's", () => {
  it("word for word", () => {
    expect(TEXT_GOES_ON).toBe(SHORT_REPLIES_TEXT.promptLine);
    expect(TEXT_GOES_ON_FIELD).toBe(SHORT_REPLIES_TEXT.fieldLine);
  });
});

describe("every turn's request", () => {
  it.each(TURNS)("%s: the line once in the text rules, after the first paragraph's rules and before the show-don't-tell bullet", (_, build) => {
    const prompt = beatStep.request(build()).prompt;
    expect(occurrences(prompt, TEXT_GOES_ON)).toBe(1);
    expect(occurrences(prompt, `\n${TEXT_GOES_ON}\n- Show, don't tell.\n`)).toBe(1);
    expect(prompt.indexOf(TEXT_GOES_ON)).toBeGreaterThan(prompt.indexOf("- The first paragraph must"));
  });

  it.each(TURNS)("%s: the field line once in every player's text field, after its count", (_, build) => {
    for (const [, player] of players(beatStep.request(build()).schema)) {
      const description = textField(player);
      expect(occurrences(description, TEXT_GOES_ON_FIELD)).toBe(1);
      expect(occurrences(description, `${TEXT_GOES_ON_FIELD}${FIELD_ANCHOR}`)).toBe(1);
    }
  });
});

describe("beatSchemaWithTextGoesOn", () => {
  it("edits every player's text field once and keeps slots that share one instance sharing one", () => {
    const shared = z.object({ text: z.string().describe(`Main text.\n- Write 5-6 paragraphs.\n${FIELD_ANCHOR}- More.`), title: z.string() });
    const own = z.object({ text: z.string().describe(`Own text.\n${FIELD_ANCHOR}`), title: z.string() });
    const root = z.object({ player1: shared, player2: shared, player3: own, statChanges: z.array(z.string()) });
    const edited = beatSchemaWithTextGoesOn(root);
    const [p1, p2, p3] = ["player1", "player2", "player3"].map((slot) => edited.shape[slot] as z.AnyZodObject);
    expect(p1).toBe(p2);
    expect(p3).not.toBe(p1);
    expect(textField(p1)).toBe(`Main text.\n- Write 5-6 paragraphs.\n${TEXT_GOES_ON_FIELD}${FIELD_ANCHOR}- More.`);
    expect(textField(p3)).toBe(`Own text.\n${TEXT_GOES_ON_FIELD}${FIELD_ANCHOR}`);
    expect(edited.shape.statChanges).toBe(root.shape.statChanges);
  });

  it("refuses a text field without its anchor, rather than send a turn without the line", () => {
    const root = z.object({ player1: z.object({ text: z.string().describe("No anchor here.") }) });
    expect(() => beatSchemaWithTextGoesOn(root)).toThrow(/Start exactly where/);
  });
});
