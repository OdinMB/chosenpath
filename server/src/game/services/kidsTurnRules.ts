import { z } from "zod";
import type { Story } from "core/models/Story.js";
import type { BeatCheckOptions } from "./beatChecks.js";

/*
 * A single player's turn in a story read with a child (the kids-turns stage of
 * 2026-10-01, fix 6 of the second playthroughs' review; measured as the eval's
 * kidsTurn, storyTextRounds/kidsTurn.ts, which production equals byte for
 * byte). The second playthroughs' mouse story, read with a five-year-old, ran
 * about 300 words a turn of grown-up prose: every turn is told three times to
 * write "5-6 paragraphs with 3-5 sentences each", and nothing in a turn said a
 * child was listening. On a single player's read-with-kids story (its
 * category: the setup form's, or a template tagged Kids) the turn's count is a
 * short one, in the context, a block of rules after the text rules and the
 * shouted repeat, and in the text field's description; the block names the
 * child's age the story recorded from its premise (readingAgeFromPremise), or
 * "a young child". A retry of a one-paragraph reply asks for the short count.
 * Measured on six of the mouse story's turns and a template's first turn:
 * words 317 -> 102, Flesch-Kincaid grade 7.5 -> 4.2, waits level. A group's
 * read-with-kids turn keeps production's count: the stage measured one player.
 */

/** Whether a turn takes the kids rules: a single player's story read with a child. */
export function takesKidsRules(story: Story): boolean {
  return story.isReadWithKids() && !story.isMultiplayer();
}

/** Who listens: the child's recorded age, or a young child. */
export function kidsListener(story: Story): string {
  const age = story.getReadingAge();
  return age ? `a child aged ${age}` : "a young child";
}

/** The context's count on a kids turn, in place of "5-6 paragraphs of 3-5 sentences". */
export const KIDS_CONTEXT = "are a narrative structure of 3-4 short paragraphs of 2-3 short sentences each followed by a decision that the player must make.";

/** The block after the text rules. */
export function kidsRules(who: string): string {
  return [
    `- Read with a child: ${who} listens while an adult reads this story aloud, and helps choose the options.`,
    "--- Write 3-4 short paragraphs of 2-3 sentences each, about 80 to 140 words in all.",
    "--- Keep sentences short and plain: about 5 to 12 words, one thing happening in each.",
    "--- Use everyday words that child knows: things they can see, hear, touch and feel. No grown-up or abstract words and no figures of speech. If the story needs a new word, explain it in the same sentence.",
    "--- Keep direct speech short and lively.",
    "--- The options and interludes follow the same rules: each one short sentence in those words (a sacrifice or reward option still names its stat and amount).",
  ].join("\n");
}

/** The shouted repeat on a kids turn, at the end of the text rules and of the text field's description. */
export function kidsRepeat(who: string): string {
  return `These are a lot of instructions, so let me repeat the most important one: ${who} listens to this story, so you MUST write 3-4 short paragraphs of 2-3 short sentences each, in everyday words that child knows! So again: 3-4 short paragraphs, 2-3 short sentences each!`;
}

/** The text field's count on a kids turn. */
export function kidsFieldCount(who: string): string {
  return `- Write 3-4 short paragraphs.\n- Each paragraph must have 2-3 short sentences, in everyday words ${who} knows.\n`;
}

/** What a retry of a one-paragraph reply asks for on a kids turn. */
export const KIDS_TEXT_COUNT = "three or four short paragraphs of two or three short sentences each";

/** The text field description's count and repeat, as core's beat schema writes them for every turn. */
const FIELD_COUNT = "- Write 5-6 paragraphs.\n- Each paragraph must have 3-5 sentences.\n";
const FIELD_REPEAT =
  "These are a lot of instructions, so let me repeat the most important one: You MUST write 5-6 paragraphs with 3-5 sentences each! Otherwise, there simply isn't enough text to move the story forward with enough depth and detail. So again: 5-6 paragraphs, 3-5 sentences each!";

function replaceOnce(text: string, passage: string, replacement: string): string {
  const n = text.split(passage).length - 1;
  if (n !== 1) throw new Error(`Kids turn: the text field's "${passage.slice(0, 40)}" found ${n} times`);
  return text.replace(passage, () => replacement);
}

/**
 * The reply schema with every player's text description given the short count
 * and repeat. Slots that share one beat schema instance keep sharing one.
 */
export function beatSchemaForKids(root: z.AnyZodObject, who: string): z.AnyZodObject {
  const edited = new Map<unknown, z.AnyZodObject>();
  const players = Object.fromEntries(
    Object.entries(root.shape)
      .filter(([key]) => /^player\d+$/.test(key))
      .map(([key, value]) => {
        const known = edited.get(value);
        if (known) return [key, known];
        if (!(value instanceof z.ZodObject)) throw new Error(`Kids turn: ${key} is not an object schema`);
        const text = value.shape.text;
        if (!(text instanceof z.ZodString) || !text.description) throw new Error(`Kids turn: ${key}'s text has no description`);
        const description = replaceOnce(replaceOnce(text.description, FIELD_COUNT, kidsFieldCount(who)), FIELD_REPEAT, kidsRepeat(who));
        const next = value.extend({ text: z.string().describe(description) });
        edited.set(value, next);
        return [key, next];
      })
  );
  return root.extend(players);
}

/** Production's check of a beat reply: the ending shows no options, and a kids turn's retry asks for its short count. */
export function beatCheckOptions(story: Story): BeatCheckOptions {
  return { ending: story.getCurrentBeatType() === "ending", ...(takesKidsRules(story) ? { textCount: KIDS_TEXT_COUNT } : {}) };
}
