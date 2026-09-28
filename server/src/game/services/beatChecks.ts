import type { BeatGeneration, SetOfBeatGenerationSchema } from "core/types/index.js";
import { Logger } from "shared/logger.js";
import { isPlayerBeat } from "./storyTextSteps.js";

/*
 * A turn whose text comes back as one short paragraph (about 3% of Luna
 * medium turns in the eval, on every turn form; the turns ask for five or
 * six) gets one more call told the problem. A second short reply is used:
 * a short turn is better than a failed one, and the chat model already
 * retries failed calls. The paragraphs are the ones a player sees, split as
 * the client splits them (normalizeStoryText in
 * client/src/game/utils/storyTextProcessor.ts: a single newline starts a
 * paragraph, an image line joins the paragraph after it).
 */

/** The paragraphs a player sees, image tags in place. */
export function paragraphsOf(text: string): string[] {
  let result = text.normalize();
  // An image line starts a new paragraph
  result = result.replace(/\n(?!\n)(?=\s*\[image[^\]]*\])/g, "\n\n");
  // An image that starts a paragraph joins the text after it
  result = result.replace(/(^|\n\n)(\s*\[image[^\]]*\])\n(?!\n)/g, (_m, before: string, image: string) => `${before}${image} `);
  // A line starting with a comma is a soft wrap
  result = result.replace(/\n\s*,/g, " ,");
  // A trailing image joins the paragraph before it
  result = result.replace(/\n+\s*(\[image[^\]]*\])\s*$/g, " $1");
  // Every remaining single newline is a paragraph break
  result = result.replace(/([^\n])\n([^\n])/g, "$1\n\n$2");
  return result
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
}

/** Why a reply's texts can't be used as they are, phrased to follow a colon: a player's text of one paragraph or none. */
export function shortTextProblem(reply: SetOfBeatGenerationSchema): string | undefined {
  const short = Object.entries(reply)
    .filter(([key]) => isPlayerBeat(key))
    .filter(([, beat]) => paragraphsOf((beat as BeatGeneration).text ?? "").length < 2)
    .map(([key]) => key.toLowerCase());
  if (short.length === 0) return undefined;
  const texts = short.map((slot) => `the text for ${slot}`).join(" and ");
  return `${texts} ${short.length === 1 ? "is" : "are"} a single paragraph; write every player's text as five or six paragraphs of three to five sentences each`;
}

/** The prompt of the one retry: the first prompt, told why its reply could not be used. */
export function withBeatProblem(prompt: string, problem: string): string {
  return `${prompt}\n\nYour previous reply could not be used: ${problem}. Write the beats again.`;
}

/** A beat call, checked for texts of one paragraph: one more call told the problem, and the second reply is used either way. */
export async function checkedBeatReply(
  prompt: string,
  invoke: (prompt: string) => Promise<SetOfBeatGenerationSchema>,
  log: (line: string) => void = (line) => Logger.Story.warn(line)
): Promise<SetOfBeatGenerationSchema> {
  const first = await invoke(prompt);
  const problem = shortTextProblem(first);
  if (!problem) return first;
  // Counts only: the problem names slots, never text
  log("A beat came back as a single short paragraph; asking once more");
  const second = await invoke(withBeatProblem(prompt, problem));
  if (shortTextProblem(second)) log("A beat came back as a single short paragraph again; using it");
  return second;
}
