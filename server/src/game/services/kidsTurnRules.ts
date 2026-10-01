import { z } from "zod";
import type { Story } from "core/models/Story.js";
import { kidsBandOf, type KidsBand } from "core/types/index.js";
import type { BeatCheckOptions } from "./beatChecks.js";

/*
 * A turn in a story read with a child, by the children's age band.
 *
 * The kids-turns stage of 2026-10-01 (fix 6 of the second playthroughs'
 * review; measured as the eval's kidsTurn, storyTextRounds/kidsTurn.ts): the
 * second playthroughs' mouse story, read with a five-year-old, ran about 300
 * words a turn of grown-up prose: every turn is told three times to write
 * "5-6 paragraphs with 3-5 sentences each", and nothing in a turn said a child
 * was listening. A single player's read-with-kids turn got a short count, in
 * the context, a block of rules after the text rules and the shouted repeat,
 * and in the text field's description, for the child's recorded age or "a
 * young child": words 317 -> 102, Flesch-Kincaid grade 7.5 -> 4.2.
 *
 * The kids-ages stage of the same day (the owner's decision: "this should
 * depend on the age range that should be part of kids stories settings";
 * measured as the eval's kidsAges, storyTextRounds/kidsAges.ts, which
 * production equals byte for byte, prompt and JSON schema): one length for
 * every age gave a picture book's listener an early chapter book's turn, and a
 * group's read-with-kids turn kept the grown-up count. Now every read-with-kids
 * turn, every player count, takes the band of its youngest child (kidsBandOf),
 * 6-8 where the story records no age:
 * - 3-5, picture books (Mary Kole Editorial: at most 600 words, ages 3-7;
 *   publishers' guides: 250-600 words for ages 2-5, 10-60 a page): 2-3 very
 *   short paragraphs, about 40 to 90 words, sentences of about 4 to 8 words.
 * - 6-8, early readers and early chapter books: the kids-turns stage's turn,
 *   3-4 short paragraphs, about 80 to 140 words, sentences of 5 to 12 words.
 * - 9-12, chapter books and young middle grade (chapter-book guides keep the
 *   average sentence "in the teens"; the Common Core band for grades 4-5 reads
 *   Flesch-Kincaid 4.51-7.73): 4-5 paragraphs, about 150 to 230 words,
 *   sentences of about 8 to 15 words.
 * Measured on the mouse story's turns at ages 4 and 10 and a two-player animal
 * rescue's first and switch turns at 4, 7 and 10, against production: turns
 * that read for their band 1 -> 6 of 12 at 4 and at 10 (one player), 0 -> 9 of
 * 12 for the group (words 304 -> 122, grade 7.1 -> 2.9), waits level.
 *
 * Picture places follow each band's paragraphs, never the last (production's
 * lines named "the third or fourth paragraph", which a short turn's last
 * paragraph can be): 3-5 the first, and the second only of three; 6-8 the
 * second, or the third of four (the review of fix 6); 9-12 the first and the
 * third. A retry of a one-paragraph reply asks for the band's count.
 */

/** Whether a turn takes the kids rules: a story read with a child, every player count. */
export function takesKidsRules(story: Story): boolean {
  return story.isReadWithKids();
}

/** The band a kids turn is written for: the youngest child's, or 6-8 (the measured kids turn) where the story records no age. */
export function kidsBand(story: Story): KidsBand {
  const ages = story.getKidAges();
  return ages ? kidsBandOf(ages) : "6-8";
}

/** Who listens: the children's recorded ages, or a young child. */
export function kidsListener(story: Story): string {
  const age = story.getReadingAge();
  return age ? `a child aged ${age}` : "a young child";
}

/** One band's text on a kids turn. */
export type KidsTurnText = {
  /** The context's count, in place of "5-6 paragraphs of 3-5 sentences". */
  context: string;
  /** The block after the text rules. */
  rules: (who: string) => string;
  /** The shouted repeat, at the end of the text rules and of the text field's description. */
  repeat: (who: string) => string;
  /** The text field's count. */
  fieldCount: (who: string) => string;
  /** What a retry of a one-paragraph reply asks for. */
  textCount: string;
  /** Where image tags go on a turn that shows images: the text rules' line, the text field's line, and where the text field places a generated image. */
  image: { distribution: string; fieldDistribution: string; fieldLate: string };
};

const THREE_TO_FIVE: KidsTurnText = {
  context: "are a narrative structure of 2-3 very short paragraphs of 1-3 short sentences each followed by a decision that the player must make.",
  rules: (who) =>
    [
      `- Read with a child: ${who} listens while an adult reads this story aloud, and helps choose the options.`,
      "--- Write 2-3 very short paragraphs of 1-3 sentences each, about 40 to 90 words in all, like a page or two of a picture book.",
      "--- Keep sentences very short and simple: about 4 to 8 words, one thing happening in each.",
      "--- Use only words that child uses every day: things they can see, hear, touch and feel, and simple feelings like happy, sad or scared. No abstract words and no figures of speech. Sounds and a little repetition are welcome.",
      "--- Keep direct speech to a few short words.",
      "--- The options and interludes follow the same rules: each one a very short sentence of a few words (a sacrifice or reward option still names its stat and amount).",
    ].join("\n"),
  repeat: (who) =>
    `These are a lot of instructions, so let me repeat the most important one: ${who} listens to this story, so you MUST write 2-3 very short paragraphs of 1-3 very short sentences each, in words that child uses every day! So again: 2-3 very short paragraphs, 1-3 very short sentences each!`,
  fieldCount: (who) => `- Write 2-3 very short paragraphs.\n- Each paragraph must have 1-3 very short sentences, in everyday words ${who} knows.\n`,
  textCount: "two or three very short paragraphs of one to three very short sentences each",
  image: {
    distribution: "--- A good distribution is an image tag for the first paragraph, and one for the second paragraph only if there are three.\n",
    fieldDistribution:
      "--- A good distribution is to have one image tag right before the first paragraph, and one on the second paragraph only if there are three. Never put an image tag on the last paragraph.\n",
    fieldLate: "Use it on the second paragraph if there are three, else on the first.",
  },
};

const SIX_TO_EIGHT: KidsTurnText = {
  context: "are a narrative structure of 3-4 short paragraphs of 2-3 short sentences each followed by a decision that the player must make.",
  rules: (who) =>
    [
      `- Read with a child: ${who} listens while an adult reads this story aloud, and helps choose the options.`,
      "--- Write 3-4 short paragraphs of 2-3 sentences each, about 80 to 140 words in all.",
      "--- Keep sentences short and plain: about 5 to 12 words, one thing happening in each.",
      "--- Use everyday words that child knows: things they can see, hear, touch and feel. No grown-up or abstract words and no figures of speech. If the story needs a new word, explain it in the same sentence.",
      "--- Keep direct speech short and lively.",
      "--- The options and interludes follow the same rules: each one short sentence in those words (a sacrifice or reward option still names its stat and amount).",
    ].join("\n"),
  repeat: (who) =>
    `These are a lot of instructions, so let me repeat the most important one: ${who} listens to this story, so you MUST write 3-4 short paragraphs of 2-3 short sentences each, in everyday words that child knows! So again: 3-4 short paragraphs, 2-3 short sentences each!`,
  fieldCount: (who) => `- Write 3-4 short paragraphs.\n- Each paragraph must have 2-3 short sentences, in everyday words ${who} knows.\n`,
  textCount: "three or four short paragraphs of two or three short sentences each",
  image: {
    distribution: "--- A good distribution is an image tag for the first paragraph and one for the second paragraph (or the third, if there are four).\n",
    fieldDistribution:
      "--- A good distribution is to have one image tag right before the first paragraph and one on the second paragraph (or the third, if there are four). Never put an image tag on the last paragraph.\n",
    fieldLate: "Use it relatively late in the beat text (the second paragraph, or the third if there are four).",
  },
};

const NINE_TO_TWELVE: KidsTurnText = {
  context: "are a narrative structure of 4-5 paragraphs of 2-4 sentences each followed by a decision that the player must make.",
  rules: (who) =>
    [
      `- Read with a child: ${who} listens while an adult reads this story aloud, or reads along, and helps choose the options.`,
      "--- Write 4-5 paragraphs of 2-4 sentences each, about 150 to 230 words in all, like a page of a chapter book.",
      "--- Keep sentences clear: about 8 to 15 words, never several ideas strung together.",
      "--- Use words that child knows. A new or unusual word is fine where the sentence makes its meaning clear; no grown-up jargon and no abstract talk.",
      "--- Direct speech can carry the scene: short, lively exchanges.",
      "--- The options and interludes follow the same rules: each one sentence in those words (a sacrifice or reward option still names its stat and amount).",
    ].join("\n"),
  repeat: (who) =>
    `These are a lot of instructions, so let me repeat the most important one: ${who} listens to this story, so you MUST write 4-5 paragraphs of 2-4 sentences each, in words that child knows! So again: 4-5 paragraphs, 2-4 sentences each!`,
  fieldCount: (who) => `- Write 4-5 paragraphs.\n- Each paragraph must have 2-4 sentences, in words ${who} knows.\n`,
  textCount: "four or five paragraphs of two to four sentences each",
  image: {
    distribution: "--- A good distribution is an image tag for the first paragraph and one for the third paragraph.\n",
    fieldDistribution: "--- A good distribution is to have one image tag right before the first paragraph and one on the third paragraph. Never put an image tag on the last paragraph.\n",
    fieldLate: "Use it relatively late in the beat text (the third paragraph).",
  },
};

/** Each band's text on a kids turn. */
export const KIDS_BAND_TURNS: Record<KidsBand, KidsTurnText> = { "3-5": THREE_TO_FIVE, "6-8": SIX_TO_EIGHT, "9-12": NINE_TO_TWELVE };

/** The text of a kids turn's band. */
export function kidsTurnText(story: Story): KidsTurnText {
  return KIDS_BAND_TURNS[kidsBand(story)];
}

/** The text field description's count, repeat and image places, as core's beat schema writes them for every turn. */
const FIELD_COUNT = "- Write 5-6 paragraphs.\n- Each paragraph must have 3-5 sentences.\n";
const FIELD_REPEAT =
  "These are a lot of instructions, so let me repeat the most important one: You MUST write 5-6 paragraphs with 3-5 sentences each! Otherwise, there simply isn't enough text to move the story forward with enough depth and detail. So again: 5-6 paragraphs, 3-5 sentences each!";
const FIELD_IMAGE_DISTRIBUTION =
  "--- A good distribution is to have one image tag right before the first paragraph and one on the third or fourth paragraph. Avoid using image tags in or right in front of the last paragraph.\n";
const FIELD_IMAGE_LATE = "Use it relatively late in the beat text (third or fourth paragraph).";

function replaceOnce(text: string, passage: string, replacement: string): string {
  const n = text.split(passage).length - 1;
  if (n !== 1) throw new Error(`Kids turn: the text field's "${passage.slice(0, 40)}" found ${n} times`);
  return text.replace(passage, () => replacement);
}

/** A kids turn's text description: the band's count and repeat, and its image places where the story shows images. */
function kidsTextDescription(description: string, story: Story): string {
  const text = kidsTurnText(story);
  const who = kidsListener(story);
  let edited = replaceOnce(replaceOnce(description, FIELD_COUNT, text.fieldCount(who)), FIELD_REPEAT, text.repeat(who));
  // The same condition core's beat schema prints its image lines on
  if (story.generatesImages() || story.hasImages()) edited = replaceOnce(edited, FIELD_IMAGE_DISTRIBUTION, text.image.fieldDistribution);
  if (story.generatesImages()) edited = replaceOnce(edited, FIELD_IMAGE_LATE, text.image.fieldLate);
  return edited;
}

/**
 * The reply schema with every player's text description given the band's
 * count, repeat and image places. Slots that share one beat schema instance
 * keep sharing one.
 */
export function beatSchemaForKids(root: z.AnyZodObject, story: Story): z.AnyZodObject {
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
        const next = value.extend({ text: z.string().describe(kidsTextDescription(text.description, story)) });
        edited.set(value, next);
        return [key, next];
      })
  );
  return root.extend(players);
}

/** Production's check of a beat reply: the ending shows no options, and a kids turn's retry asks for its band's count. */
export function beatCheckOptions(story: Story): BeatCheckOptions {
  return { ending: story.getCurrentBeatType() === "ending", ...(takesKidsRules(story) ? { textCount: kidsTurnText(story).textCount } : {}) };
}
