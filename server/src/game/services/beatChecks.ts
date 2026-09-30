import type { BeatGeneration, SetOfBeatGenerationSchema } from "core/types/index.js";
import { Logger } from "shared/logger.js";
import { UnusableResultError, errorClass } from "./retryOnce.js";
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
 *
 * A turn that comes back with no options for a player (outside the ending,
 * which shows none) gets the same one call, since 2026-09-30 (1 of 64
 * production turns that morning; the player could not go on). Unlike a short
 * text, a reply without options is never used: when the retry has none
 * either, or its call fails, the turn fails (and the game sends a failed turn
 * once more), unless the first reply had options and was only short.
 */

/** Which turn a reply is checked for: at the `ending` the game shows no options. */
export type BeatCheckOptions = { ending?: boolean };

const playerBeats = (reply: SetOfBeatGenerationSchema): [string, BeatGeneration][] =>
  Object.entries(reply)
    .filter(([key]) => isPlayerBeat(key))
    .map(([key, beat]) => [key.toLowerCase(), beat as BeatGeneration]);

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
  const short = playerBeats(reply)
    .filter(([, beat]) => paragraphsOf(beat.text ?? "").length < 2)
    .map(([slot]) => slot);
  if (short.length === 0) return undefined;
  const texts = short.map((slot) => `the text for ${slot}`).join(" and ");
  return `${texts} ${short.length === 1 ? "is" : "are"} a single paragraph; write every player's text as five or six paragraphs of three to five sentences each`;
}

/** Why a reply can't be played, phrased to follow a colon: a player's beat without options (none is asked of the ending). */
export function missingOptionsProblem(reply: SetOfBeatGenerationSchema, options: BeatCheckOptions = {}): string | undefined {
  if (options.ending) return undefined;
  const missing = playerBeats(reply)
    .filter(([, beat]) => !Array.isArray(beat.options) || beat.options.length === 0)
    .map(([slot]) => slot);
  if (missing.length === 0) return undefined;
  const beats = missing.length === 1 ? `the beat for ${missing[0]} has` : `the beats for ${missing.join(" and ")} have`;
  return `${beats} no options; write three options for every player's beat`;
}

/** Every problem the one retry is told, the short text first; undefined when the reply is fine. */
export function beatReplyProblem(reply: SetOfBeatGenerationSchema, options: BeatCheckOptions = {}): string | undefined {
  const problems = [shortTextProblem(reply), missingOptionsProblem(reply, options)].filter((p): p is string => p !== undefined);
  return problems.length > 0 ? problems.join("; ") : undefined;
}

/** The prompt of the one retry: the first prompt, told why its reply could not be used. */
export function withBeatProblem(prompt: string, problem: string): string {
  return `${prompt}\n\nYour previous reply could not be used: ${problem}. Write the beats again.`;
}

/**
 * A beat call, checked for texts of one paragraph and for beats without
 * options: one more call told the problem. A short second reply is used; one
 * without options is not. So the second reply is used when it has options;
 * otherwise the first, when it had options (it was only short); otherwise the
 * turn fails with an UnusableResultError. When the second call fails (after
 * the chat model's own re-sends), the first is used if it has options, and
 * the call's error fails the turn if it has none.
 */
export async function checkedBeatReply(
  prompt: string,
  invoke: (prompt: string) => Promise<SetOfBeatGenerationSchema>,
  log: (line: string) => void = (line) => Logger.Story.warn(line),
  options: BeatCheckOptions = {}
): Promise<SetOfBeatGenerationSchema> {
  const first = await invoke(prompt);
  const problem = beatReplyProblem(first, options);
  if (!problem) return first;
  const playable = missingOptionsProblem(first, options) === undefined;
  // Counts only: the problem names slots, never text
  log(`A beat came back ${playable ? "as a single short paragraph" : "with no options"}; asking once more`);
  let second: SetOfBeatGenerationSchema;
  try {
    second = await invoke(withBeatProblem(prompt, problem));
  } catch (error) {
    // The error's class only: its message can quote the reply
    if (!playable) {
      log(`A beat's retry failed (${errorClass(error)}); the first reply has no options, so the turn fails`);
      throw error;
    }
    log(`A beat's retry failed (${errorClass(error)}); using the first reply`);
    return first;
  }
  const missing = missingOptionsProblem(second, options);
  if (missing) {
    if (playable) {
      log("A beat's retry came back with no options; using the first reply");
      return first;
    }
    log("A beat came back with no options again; the turn fails");
    throw new UnusableResultError("beat", missing);
  }
  if (shortTextProblem(second)) log("A beat came back as a single short paragraph again; using it");
  return second;
}
