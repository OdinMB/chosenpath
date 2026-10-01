import { z } from "zod";
import type { Story } from "core/models/Story.js";
import { kidsBandOf, type GameMode, type KidAges, type KidsBand, type PlayerCount } from "core/types/index.js";
import type { SetupPromptOptions } from "../prompts/StorySetupPromptService.js";
import { beatStep, setupStep, type SetupRequest, type TextRequest } from "../storyTextSteps.js";
import { replaceOnce, splitAtState } from "./roundEdits.js";

/*
 * Read-with-kids turns and setups by the children's age band (eval only; the
 * owner's decision of 2026-10-01 on fix 6: "this should depend on the age range
 * that should be part of kids stories settings"). The kids-turns stage gave a
 * single player's read-with-kids turn one length for every age, about 80 to
 * 140 words in 3-4 short paragraphs of 2-3 sentences of 5 to 12 words, measured
 * on a five-year-old's story (102 words, Flesch-Kincaid grade 4.2): a picture
 * book's listener got an early chapter book's turn and a ten-year-old the same;
 * a group's read-with-kids turn kept the grown-up 5-6 paragraphs of 3-5
 * sentences; and the kids setup budget (two visible shared and two visible
 * player stats, no hidden ones) is the same at every age.
 *
 * The bands are the youngest child's (kidsBandOf): 3-5, 6-8 and 9-12. Their
 * targets come from what children's books of those ages do, a turn being one
 * read-aloud sitting between choices:
 * - 3-5, picture books: at most about 600 words a book (Mary Kole Editorial's
 *   length guidelines: picture books, ages 3-7, at most 600; publishers'
 *   guides give 250-600 for ages 2-5 over 32 pages, 10-60 words a page), so a
 *   turn of two spreads is about 40 to 90 words, sentences of about 4 to 8
 *   words, words a child uses every day, sounds and repetition welcome.
 * - 6-8, early readers and early chapter books (Mary Kole: early readers 5-7
 *   at most 1,500 words, chapter books 7-9 4,000-15,000): the kids-turns
 *   stage's measured turn, about 80 to 140 words, sentences of about 5 to 12
 *   words; its replies read at grade 4.2, inside the Common Core text
 *   complexity band for grades 2-3 (Flesch-Kincaid 1.98-5.34, Appendix A's
 *   supplement), about ages 7 to 9.
 * - 9-12, chapter books and young middle grade (Mary Kole: young middle grade,
 *   ages 9-11, 15,000-35,000 words; chapter-book guides keep the average
 *   sentence "in the teens", Harry Potter's is about 12 words): a page of a
 *   chapter book, about 150 to 230 words in 4-5 paragraphs of 2-4 sentences,
 *   sentences of about 8 to 15 words, a new word allowed where the sentence
 *   makes it clear (the Common Core band for grades 4-5 reads Flesch-Kincaid
 *   4.51-7.73).
 * Picture places follow each band's paragraphs, never the last: 3-5 the first
 * paragraph, and the second only of three; 6-8 production's (the second, or
 * the third of four); 9-12 the first and the third.
 *
 * The variant, on a read-with-kids story of every player count, is
 * production's turn without the kids lines (production's request on the story
 * with its category taken out: a single player's B6 and exploration lines, a
 * group's form) with the band's: the context's count, one block of rules after
 * the text rules, the shouted repeat, the text field's count and repeat, the
 * image places where the turn shows images, and a retry of a one-paragraph
 * reply asking for the band's count (kidsAgesShortTextCount). The 6-8 band's
 * text is production's kids turn word for word (kidsTurnRules.ts: the measured
 * kidsTurn with the review's image places), and so is a story that records no
 * age ("a young child"): a single player's turn there is production's byte for
 * byte, a group's takes it for the first time. Every other story gets
 * production's request byte for byte.
 *
 * The setup (kidsAgesSetupRequest): the kids budget stays small up to the
 * 6-8 band (the owner rated a setup for 7-10 year olds as having "too many
 * stats" before the kids budget existed), and the 9-12 band gets a little
 * more: a third visible player stat, still no hidden ones and plain names
 * (the kids budget line, the inventory's player stat line and the player
 * stats' field). Production's kids setup byte for byte for the younger bands
 * and where no age is set.
 *
 * Adopted after the run of 2026-10-01, turns and setup (production's copy is
 * kidsTurnRules.ts, KIDS_BAND_TURNS, and setupPromptText.ts, OLDER_KIDS_STATS;
 * the kept tests hold production to this variant byte for byte, prompt and
 * JSON schema). Its bases are production's grown-up turn and its kids setup
 * without an age, which the adoption left as they were, so it still builds as
 * measured.
 */

const LABEL = "Kids-ages variant";

type BandText = {
  context: string;
  rules: (who: string) => string;
  repeat: (who: string) => string;
  fieldCount: (who: string) => string;
  shortTextCount: string;
  image: { prompt: string; field: string; late: string };
};

/** The band of the youngest child the story records, or 6-8's text for a story that records no age. */
export function kidsAgesBand(story: Story): KidsBand {
  const ages = story.getKidAges();
  return ages ? kidsBandOf(ages) : "6-8";
}

/** Who listens: the recorded ages, or a young child (production's kidsListener). */
function listenerOf(story: Story): string {
  const age = story.getReadingAge();
  return age ? `a child aged ${age}` : "a young child";
}

const SIX_TO_EIGHT: BandText = {
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
  shortTextCount: "three or four short paragraphs of two or three short sentences each",
  image: {
    prompt: "--- A good distribution is an image tag for the first paragraph and one for the second paragraph (or the third, if there are four).\n",
    field:
      "--- A good distribution is to have one image tag right before the first paragraph and one on the second paragraph (or the third, if there are four). Never put an image tag on the last paragraph.\n",
    late: "Use it relatively late in the beat text (the second paragraph, or the third if there are four).",
  },
};

const THREE_TO_FIVE: BandText = {
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
  shortTextCount: "two or three very short paragraphs of one to three very short sentences each",
  image: {
    prompt: "--- A good distribution is an image tag for the first paragraph, and one for the second paragraph only if there are three.\n",
    field:
      "--- A good distribution is to have one image tag right before the first paragraph, and one on the second paragraph only if there are three. Never put an image tag on the last paragraph.\n",
    late: "Use it on the second paragraph if there are three, else on the first.",
  },
};

const NINE_TO_TWELVE: BandText = {
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
  shortTextCount: "four or five paragraphs of two to four sentences each",
  image: {
    prompt: "--- A good distribution is an image tag for the first paragraph and one for the third paragraph.\n",
    field: "--- A good distribution is to have one image tag right before the first paragraph and one on the third paragraph. Never put an image tag on the last paragraph.\n",
    late: "Use it relatively late in the beat text (the third paragraph).",
  },
};

/** Each band's text, the passages the tests pin. */
export const KIDS_AGES_TEXT: Record<KidsBand, BandText> = { "3-5": THREE_TO_FIVE, "6-8": SIX_TO_EIGHT, "9-12": NINE_TO_TWELVE };

/** Production's turn without the kids lines: its context count, its shouted repeat, and its text field's (core's beat schema). */
const ADULT = {
  context: "are a narrative structure of 5-6 paragraphs of 3-5 sentences each followed by a decision that the player must make.",
  repeat:
    "These are a lot of instructions, so let me repeat the most important one: You MUST write 5-6 paragraphs with 3-5 sentences each! Otherwise, there simply isn't enough text to move the story forward with enough depth and detail. So again: 5-6 paragraphs, 3-5 sentences each!",
  imagePrompt: "--- A good distribution is an image tag for the first paragraph and one for the third or fourth paragraph.\n",
  fieldCount: "- Write 5-6 paragraphs.\n- Each paragraph must have 3-5 sentences.\n",
  fieldImage:
    "--- A good distribution is to have one image tag right before the first paragraph and one on the third or fourth paragraph. Avoid using image tags in or right in front of the last paragraph.\n",
  fieldLate: "Use it relatively late in the beat text (third or fourth paragraph).",
};

/** The passages of production's grown-up turn the variant edits. */
export const KIDS_AGES_ANCHORS = ADULT;

const showsImages = (story: Story) => story.generatesImages() || story.hasImages();

/** A player's text description with the band's count, repeat and image places. */
function bandTextDescription(description: string, story: Story, text: BandText, who: string): string {
  let edited = replaceOnce(LABEL, description, ADULT.fieldCount, text.fieldCount(who));
  edited = replaceOnce(LABEL, edited, ADULT.repeat, text.repeat(who));
  // Where core's beat schema prints its image lines
  if (showsImages(story)) edited = replaceOnce(LABEL, edited, ADULT.fieldImage, text.image.field);
  if (story.generatesImages()) edited = replaceOnce(LABEL, edited, ADULT.fieldLate, text.image.late);
  return edited;
}

/** The reply schema with every player's text description edited; slots sharing one instance keep sharing one. */
function bandSchema(root: z.AnyZodObject, story: Story, text: BandText, who: string): z.AnyZodObject {
  const edited = new Map<unknown, z.AnyZodObject>();
  const players = Object.fromEntries(
    Object.entries(root.shape)
      .filter(([key]) => /^player\d+$/.test(key))
      .map(([key, value]) => {
        const known = edited.get(value);
        if (known) return [key, known];
        if (!(value instanceof z.ZodObject)) throw new Error(`${LABEL}: ${key} is not an object schema`);
        const field = value.shape.text;
        if (!(field instanceof z.ZodString) || !field.description) throw new Error(`${LABEL}: ${key}'s text has no description`);
        const next = value.extend({ text: z.string().describe(bandTextDescription(field.description, story, text, who)) });
        edited.set(value, next);
        return [key, next];
      })
  );
  return root.extend(players);
}

/** The count a retry of a one-paragraph reply asks for on a kids turn of every player count; undefined (production's own) elsewhere. */
export function kidsAgesShortTextCount(story: Story): string | undefined {
  return story.isReadWithKids() ? KIDS_AGES_TEXT[kidsAgesBand(story)].shortTextCount : undefined;
}

/** Production's turn with the band's kids lines on a read-with-kids story, every player count; production's request byte for byte elsewhere. */
export function kidsAgesTurnRequest(story: Story): TextRequest<z.AnyZodObject> {
  if (!story.isReadWithKids()) return beatStep.request(story);
  const text = KIDS_AGES_TEXT[kidsAgesBand(story)];
  const who = listenerOf(story);
  // Production's grown-up turn: the same story without its category, which only the kids lines read
  const adult = beatStep.request(story.clone({ category: undefined }));
  const { instructions, state } = splitAtState(LABEL, adult.prompt);
  let edited = replaceOnce(LABEL, instructions, ADULT.context, text.context);
  edited = replaceOnce(LABEL, edited, `\n\n${ADULT.repeat}`, `\n${text.rules(who)}\n\n${text.repeat(who)}`);
  if (showsImages(story)) edited = replaceOnce(LABEL, edited, ADULT.imagePrompt, text.image.prompt);
  return { prompt: edited + state, schema: bandSchema(adult.schema, story, text, who) };
}

/*
 * The setup's kids budget by band: a third visible player stat for the 9-12
 * band, the rest as production's kids budget.
 */
const SETUP = {
  budget: {
    from: "two visible shared stats and two visible player stats, and no hidden ones.",
    to: "two visible shared stats and three visible player stats, and no hidden ones.",
  },
  inventory: {
    from: "- Two visible stats that are directly linked to the player (",
    to: "- Three visible stats that are directly linked to the player (",
  },
  field: {
    from: "Generate two visible player stats and no hidden ones: a child reads this story.",
    to: "Generate three visible player stats and no hidden ones: a child reads this story.",
  },
};

/** The setup passages the tests pin. */
export const KIDS_AGES_SETUP_TEXT = SETUP;

/** The setup's options with the setting: a child reads along, and the children's ages. */
export type KidsAgesSetupOptions = SetupPromptOptions & { kidAges?: KidAges };

/** Whether a setup takes the older band's budget: a kids setup whose youngest child is 9 or older. */
export const takesOlderKidsBudget = (options: KidsAgesSetupOptions): boolean => options.kids === true && options.kidAges !== undefined && kidsBandOf(options.kidAges) === "9-12";

/** Production's setup with the band's kids budget; production's request byte for byte below the 9-12 band, without an age and on any other story. */
export function kidsAgesSetupRequest(
  premise: string,
  playerCount: PlayerCount,
  gameMode: GameMode,
  maxTurns: number,
  kind: "story" | "template",
  options: KidsAgesSetupOptions = {}
): SetupRequest {
  // Production's kids setup as measured: the small budget, which it prints without an age
  const base = setupStep.request(premise, playerCount, gameMode, maxTurns, kind, { kids: options.kids });
  if (!takesOlderKidsBudget(options)) return base;
  let prompt = replaceOnce(LABEL, base.prompt, SETUP.budget.from, SETUP.budget.to);
  prompt = replaceOnce(LABEL, prompt, SETUP.inventory.from, SETUP.inventory.to);
  const players = base.schema.shape.playerStats;
  if (!(players instanceof z.ZodArray) || !players.description) throw new Error(`${LABEL}: the setup schema has no player stat list`);
  return { ...base, prompt, schema: base.schema.extend({ playerStats: players.describe(replaceOnce(LABEL, players.description, SETUP.field.from, SETUP.field.to)) }) };
}
