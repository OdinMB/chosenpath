import { z } from "zod";
import type { Story } from "core/models/Story.js";
import { beatStep, type TextRequest } from "../storyTextSteps.js";
import { replaceOnce, splitAtState } from "./roundEdits.js";

/*
 * Turns that come back as one short paragraph (eval only; the coordinator's
 * brief of 2026-10-01 after the second playthroughs: 13 of 126 first replies
 * were one short paragraph, and 2 of them came back short again after
 * production's one retry and were used, the food trucks' first turn for both
 * players among them).
 *
 * The cause, read from every stored GPT-6 turn reply of the eval (3,784
 * replies, 4,564 player texts outside the kids stages; a temporary probe, no
 * calls):
 * - A short text is always exactly one paragraph, and an ordinary first
 *   paragraph: 147 of 147 short texts, 45 to 96 words, three or four
 *   sentences, no line break at all. No text has two paragraphs, and 18 have
 *   three or four; the rest have five or six. So the reply doesn't write a
 *   shorter turn: it closes the text where its first paragraph break would go.
 * - What it wrote is the first paragraph the rules ask for (the chosen action
 *   and how it plays out, the plan's first show-don't-tell item); the rest of
 *   the plan's list never comes.
 * - In a group, the later players' texts follow the first player's: 31 of the
 *   34 short group replies were short for every player.
 * - The request asks for 5-6 paragraphs five times, but says what the first
 *   paragraph must do and what the last must not, and nothing about going on
 *   from the first; nor how paragraphs are written in the reply's one text
 *   string (the client splits them at line breaks, "\n\n").
 * - Some story states draw it more than others (synth-8988006e-t3's step: 13
 *   of 56 replies over every form; the first playthroughs' New Avalon turn 6: 3
 *   of 11), on both turn models (2.9% of the stored Luna medium replies, 3.6%
 *   of the Luna low). The second playthroughs' 13 of 126 is of a piece with
 *   the other cases built from long stored stories (the recorded-result stage 5
 *   of 32, the late-pacing stage 10 of 115), against 1-2% on the early frozen
 *   cases (options-continuity 6 of 373). Production's retry, which repeats the
 *   count at the end of the prompt, came back short again on 4 of the 16
 *   playthrough turns it retried (both rounds).
 *
 * The variant is production's turn with one line in the text rules, right
 * before "- Show, don't tell." (after the first paragraph's rules and the
 * turn's own lines after them, every turn kind), and one in each player's text
 * field after its count (before "- Start exactly where …", every form, a kids
 * band's included): the text goes on after its first paragraph, a blank line
 * between paragraphs, written in the field as the reply's string writes it
 * ("\n\n"). Neither names a count, so every form keeps its own (a kids band's
 * 2-3, 3-4 or 4-5). Production's request byte for byte otherwise; slots that
 * share one schema instance keep sharing one. Production's retry of a short
 * reply is unchanged.
 *
 * Adopted after the run of 2026-10-01: production's copy is textParagraphs.ts
 * (TEXT_GOES_ON, TEXT_GOES_ON_FIELD, beatSchemaWithTextGoesOn), and the kept
 * tests hold production to this variant byte for byte, prompt and JSON schema.
 * The variant builds on production with both lines taken out
 * (shortRepliesBase), so it still builds as measured.
 */

const LABEL = "Short-replies turn";

/** The text rules' bullet the prompt's line goes before: after the first paragraph's rules, on every turn kind. */
const PROMPT_ANCHOR = "\n- Show, don't tell.\n";

const PROMPT_LINE = "- The text never ends after its first paragraph: write a blank line and go on with the next paragraph, until every paragraph is written.";

/** The text field's rule the field's line goes before: right after the count, in every form's description. */
const FIELD_ANCHOR = "- Start exactly where the previous beat for this player ended.\n";

const FIELD_LINE = "- All the paragraphs go in this one text, a blank line (\\n\\n) between each and the next. The text never ends after its first paragraph: write the blank line and go on.\n";

/** The passages the tests pin. */
export const SHORT_REPLIES_TEXT = { promptAnchor: PROMPT_ANCHOR, promptLine: PROMPT_LINE, fieldAnchor: FIELD_ANCHOR, fieldLine: FIELD_LINE };

/** The reply schema with every player's text description edited; slots that share one instance keep sharing one. */
function schemaWithText(root: z.AnyZodObject, edit: (description: string) => string): z.AnyZodObject {
  const edited = new Map<unknown, z.AnyZodObject>();
  const players = Object.fromEntries(
    Object.entries(root.shape)
      .filter(([key]) => /^player\d+$/.test(key))
      .map(([key, value]) => {
        const known = edited.get(value);
        if (known) return [key, known];
        if (!(value instanceof z.ZodObject)) throw new Error(`${LABEL}: ${key} is not an object schema`);
        const text = value.shape.text;
        if (!(text instanceof z.ZodString) || !text.description) throw new Error(`${LABEL}: ${key}'s text has no description`);
        const next = value.extend({ text: z.string().describe(edit(text.description)) });
        edited.set(value, next);
        return [key, next];
      })
  );
  return root.extend(players);
}

/**
 * Production's turn as the stage measured it beside the variant. Since the
 * adoption (2026-10-01) production prints both lines on every turn
 * (textParagraphs.ts), so they are taken out (the texts are the variant's,
 * which a test holds).
 */
export function shortRepliesBase(story: Story): TextRequest<z.AnyZodObject> {
  const production = beatStep.request(story);
  const { instructions, state } = splitAtState(LABEL, production.prompt);
  const prompt = replaceOnce(LABEL, instructions, `\n${PROMPT_LINE}${PROMPT_ANCHOR}`, PROMPT_ANCHOR) + state;
  return { prompt, schema: schemaWithText(production.schema, (d) => replaceOnce(LABEL, d, `${FIELD_LINE}${FIELD_ANCHOR}`, FIELD_ANCHOR)) };
}

/** A turn request with the variant's two lines: in its text rules and in every player's text field (the kept tests put them on the forms measured before). */
export function withShortRepliesLines(request: TextRequest<z.AnyZodObject>): TextRequest<z.AnyZodObject> {
  const { instructions, state } = splitAtState(LABEL, request.prompt);
  const prompt = replaceOnce(LABEL, instructions, PROMPT_ANCHOR, `\n${PROMPT_LINE}${PROMPT_ANCHOR}`) + state;
  return { prompt, schema: schemaWithText(request.schema, (d) => replaceOnce(LABEL, d, FIELD_ANCHOR, `${FIELD_LINE}${FIELD_ANCHOR}`)) };
}

/** Production's turn (as measured) with the line in the text rules and in each player's text field; every turn kind and player count. */
export function shortRepliesRequest(story: Story): TextRequest<z.AnyZodObject> {
  return withShortRepliesLines(shortRepliesBase(story));
}
