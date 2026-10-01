import { z } from "zod";

/*
 * A turn's text goes on after its first paragraph (the short-replies stage of
 * 2026-10-01, measured as the eval's shortReplies, storyTextRounds/shortReplies.ts,
 * which production equals byte for byte, prompt and JSON schema).
 *
 * In the second playthroughs 13 of 126 first replies came back as one short
 * paragraph, and 2 came back short again after the retry (beatChecks.ts) and
 * were used. A short text in the eval's stored replies is always exactly an
 * ordinary first paragraph (147 of 147, 45-96 words, no line break; no text has
 * two paragraphs): the reply closes its text where its first paragraph break
 * would go, and in a group the later players' texts follow the first's. The
 * request said what the first paragraph must do and what the last must not, and
 * nothing about going on after the first, nor how the paragraphs are written in
 * the reply's one string. Measured on 23 turns (the round's short turns, the
 * stored turns that came back short most often, ordinary ones), twice, against
 * production: first replies short 7 of 46 -> 2 of 46 (moved, p 0.079), nothing
 * else moved, cost and waits level or lower.
 *
 * Every turn, every player count and form (a kids band's included, whose count
 * the lines leave to the form): one line in the text rules, after the first
 * paragraph's rules (BeatPromptService), and one in each player's text field,
 * after its count. Production's retry of a short reply is unchanged.
 */

/** The text rules' line, before "- Show, don't tell.". */
export const TEXT_GOES_ON = "- The text never ends after its first paragraph: write a blank line and go on with the next paragraph, until every paragraph is written.";

/** The text field's line, after its count. */
export const TEXT_GOES_ON_FIELD = "- All the paragraphs go in this one text, a blank line (\\n\\n) between each and the next. The text never ends after its first paragraph: write the blank line and go on.\n";

/** The text field's rule the line goes before, in every form's description. */
const FIELD_ANCHOR = "- Start exactly where the previous beat for this player ended.\n";

function withLine(description: string): string {
  const at = description.indexOf(FIELD_ANCHOR);
  if (at < 0 || description.indexOf(FIELD_ANCHOR, at + 1) >= 0) throw new Error(`A beat's text field must hold "${FIELD_ANCHOR.trim()}" once`);
  return `${description.slice(0, at)}${TEXT_GOES_ON_FIELD}${description.slice(at)}`;
}

/** The reply schema with every player's text field given the line; slots that share one instance keep sharing one. */
export function beatSchemaWithTextGoesOn(root: z.AnyZodObject): z.AnyZodObject {
  const edited = new Map<unknown, z.AnyZodObject>();
  const players = Object.fromEntries(
    Object.entries(root.shape)
      .filter(([key]) => /^player\d+$/.test(key))
      .map(([key, value]) => {
        const known = edited.get(value);
        if (known) return [key, known];
        if (!(value instanceof z.ZodObject)) throw new Error(`${key} is not an object schema`);
        const text = value.shape.text;
        if (!(text instanceof z.ZodString) || !text.description) throw new Error(`${key}'s text has no description`);
        const next = value.extend({ text: z.string().describe(withLine(text.description)) });
        edited.set(value, next);
        return [key, next];
      })
  );
  return root.extend(players);
}
