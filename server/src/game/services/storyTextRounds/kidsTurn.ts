import { z } from "zod";
import type { Story } from "core/models/Story.js";
import type { TextRequest } from "../storyTextSteps.js";
import { choiceResultRequest } from "./choiceResult.js";
import { replaceOnce, splitAtState } from "./roundEdits.js";

/*
 * Read-with-kids turns, shorter and simpler for the reading age the setup
 * states (eval only; fix 6 of the second playthroughs' review, 2026-10-01).
 * Found in the stored mouse story (read with a five-year-old, 10 turns):
 * every turn ran about 300 words in five or six paragraphs of long sentences,
 * the same as a grown-up story's, with words above the age ("a faint,
 * irregular tapping", "still have to be reckoned with", "Mouse Smarts:
 * Passage Expert knowledge"), and the options were grown-up sentences too
 * ("Compare the floor-level draft with the marks on the crumb map, using your
 * passage knowledge to trace where the trail bends"). The cause, in
 * production's request: nothing in a turn says a child is listening. The
 * kids setup (KIDS_STATS) changes the stats only; the story's guidelines ask
 * for a gentle tone, not a length or a vocabulary; the premise that states the
 * child's age never reaches a turn; and every turn is told three times to
 * write "5-6 paragraphs with 3-5 sentences each" (the context, the text
 * rules' shouted repeat, and the text field's description with its own
 * repeat), with "Otherwise, there simply isn't enough text".
 *
 * The variant is production's turn today (choiceResultRequest, every player
 * count) with, on a read-with-kids story (the story's category: a custom story
 * from the read-with-kids form, or a template tagged Kids):
 * - the context's count made "3-4 short paragraphs of 2-3 short sentences";
 * - one block of rules after the text rules, for a child of the age the story
 *   recorded from its premise ("a child aged 5"; "a young child" where it
 *   recorded none, as a template does): the count with about 80 to 140 words
 *   in all, short plain sentences, the child's everyday words, short speech,
 *   and the options and interludes in the same words;
 * - the shouted repeat made the short count, in the child's words;
 * - the text field's description the same (its count and its repeat), one
 *   edited schema instance shared by every player slot as production shares
 *   its own;
 * - a retry of a one-paragraph reply asks for the short count
 *   (kidsShortTextCount; the eval's checked retry reads it off the request).
 * Every other story gets production's request byte for byte.
 *
 * Adopted for a single player after the run of 2026-10-01 (production's copy
 * is kidsTurnRules.ts; the kept tests hold production to this variant byte for
 * byte, prompt and JSON schema). Its base is built from the frozen measured
 * forms, so it still builds as measured. A group's read-with-kids turn kept
 * production's count: the stage measured one player. Since the kids-ages
 * stage of the same day every read-with-kids turn takes its children's age
 * band (kidsAges.ts); this variant's text is the 6-8 band's.
 */

const LABEL = "Kids turn";

/** Production's count in the context section. */
const CONTEXT_ANCHOR = "are a narrative structure of 5-6 paragraphs of 3-5 sentences each followed by a decision that the player must make.";
const CONTEXT = "are a narrative structure of 3-4 short paragraphs of 2-3 short sentences each followed by a decision that the player must make.";

/** Production's shouted repeat, at the end of the text rules and of the text field's description. */
const REPEAT_ANCHOR =
  "These are a lot of instructions, so let me repeat the most important one: You MUST write 5-6 paragraphs with 3-5 sentences each! Otherwise, there simply isn't enough text to move the story forward with enough depth and detail. So again: 5-6 paragraphs, 3-5 sentences each!";

/** Production's count in the text field's description. */
const FIELD_COUNT_ANCHOR = "- Write 5-6 paragraphs.\n- Each paragraph must have 3-5 sentences.\n";

/** Who listens: the recorded age, or a young child. */
const listenerOf = (story: Story): string => {
  const age = story.getReadingAge();
  return age ? `a child aged ${age}` : "a young child";
};

const rules = (who: string) =>
  [
    `- Read with a child: ${who} listens while an adult reads this story aloud, and helps choose the options.`,
    "--- Write 3-4 short paragraphs of 2-3 sentences each, about 80 to 140 words in all.",
    "--- Keep sentences short and plain: about 5 to 12 words, one thing happening in each.",
    "--- Use everyday words that child knows: things they can see, hear, touch and feel. No grown-up or abstract words and no figures of speech. If the story needs a new word, explain it in the same sentence.",
    "--- Keep direct speech short and lively.",
    "--- The options and interludes follow the same rules: each one short sentence in those words (a sacrifice or reward option still names its stat and amount).",
  ].join("\n");

const repeat = (who: string) =>
  `These are a lot of instructions, so let me repeat the most important one: ${who} listens to this story, so you MUST write 3-4 short paragraphs of 2-3 short sentences each, in everyday words that child knows! So again: 3-4 short paragraphs, 2-3 short sentences each!`;

const fieldCount = (who: string) => `- Write 3-4 short paragraphs.\n- Each paragraph must have 2-3 short sentences, in everyday words ${who} knows.\n`;

/** What a retry of a one-paragraph reply asks for, in place of production's five or six paragraphs. */
const SHORT_TEXT_COUNT = "three or four short paragraphs of two or three short sentences each";

/** The passages the tests pin. */
export const KIDS_TURN_TEXT = { contextAnchor: CONTEXT_ANCHOR, context: CONTEXT, repeatAnchor: REPEAT_ANCHOR, fieldCountAnchor: FIELD_COUNT_ANCHOR, rules, repeat, fieldCount, shortTextCount: SHORT_TEXT_COUNT };

/** Whether a turn takes the kids rules: the story is read with a child. */
export function takesKidsTurn(story: Story): boolean {
  return story.isReadWithKids();
}

/** The count a retry of a one-paragraph reply asks for on a kids turn; undefined (production's own) elsewhere. */
export function kidsShortTextCount(story: Story): string | undefined {
  return takesKidsTurn(story) ? SHORT_TEXT_COUNT : undefined;
}

function asObject(schema: unknown, name: string): z.AnyZodObject {
  if (!(schema instanceof z.ZodObject)) throw new Error(`${LABEL}: ${name} is not an object schema`);
  return schema;
}

/** The text description with the short count and repeat for this listener. */
function kidsTextDescription(description: string, who: string): string {
  const counted = replaceOnce(LABEL, description, FIELD_COUNT_ANCHOR, fieldCount(who));
  return replaceOnce(LABEL, counted, REPEAT_ANCHOR, repeat(who));
}

/**
 * The reply schema with every player's text description edited. Production's
 * slots share one beat schema instance (a single player's is its own, with the
 * option rules), so each distinct instance is edited once and shared the same way.
 */
function kidsSchema(root: z.AnyZodObject, who: string): z.AnyZodObject {
  const edited = new Map<unknown, z.AnyZodObject>();
  const players = Object.fromEntries(
    Object.entries(root.shape)
      .filter(([key]) => /^player\d+$/.test(key))
      .map(([key, value]) => {
        const known = edited.get(value);
        if (known) return [key, known];
        const player = asObject(value, key);
        const text = player.shape.text;
        if (!(text instanceof z.ZodString) || !text.description) throw new Error(`${LABEL}: ${key}'s text has no description`);
        const next = player.extend({ text: z.string().describe(kidsTextDescription(text.description, who)) });
        edited.set(value, next);
        return [key, next];
      })
  );
  return root.extend(players);
}

/** Production's turn with the kids rules on a read-with-kids story; production's request byte for byte elsewhere. */
export function kidsTurnRequest(story: Story): TextRequest {
  const base = choiceResultRequest(story);
  if (!takesKidsTurn(story)) return base;
  const who = listenerOf(story);
  const { instructions, state } = splitAtState(LABEL, base.prompt);
  let edited = replaceOnce(LABEL, instructions, CONTEXT_ANCHOR, CONTEXT);
  edited = replaceOnce(LABEL, edited, `\n\n${REPEAT_ANCHOR}`, `\n${rules(who)}\n\n${repeat(who)}`);
  return { prompt: edited + state, schema: kidsSchema(asObject(base.schema, "the reply"), who) };
}
