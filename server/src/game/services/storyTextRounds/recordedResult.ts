import type { Story } from "core/models/Story.js";
import type { Thread } from "core/types/index.js";
import { getThreadType } from "core/types/index.js";
import type { TextRequest } from "../storyTextSteps.js";
import { choiceResultRequest } from "./choiceResult.js";
import { replaceOnce, splitAtState } from "./roundEdits.js";

/*
 * The turn after an exploration step tells the result the game recorded (eval
 * only; fix 2 of the second playthroughs' review, 2026-09-30). On an
 * exploration step the game records the chosen option as the step's result
 * (option n is resolution n), and the next turn narrates it. Found in the
 * stored stories: at food trucks turn 21 Suri chose to make the cabinet's
 * verified operation a condition and wait (result 1); turn 22's text kept the
 * ingredients out of the cabinet and stored facts saying so ("the demonstration
 * ingredients remain outside the cold cabinet"). At turn 22 she chose result
 * 2, to use the cabinet within disclosed safeguards, and the game recorded it.
 * The switch turn 23 was shown the chosen option and "RESOLUTION: RESOLUTION2",
 * yet its plan read the choice as "the cabinet will not be used unless its
 * operation is verified", its text wrote "No ingredients stored here until the
 * operating temperature is independently verified", its milestone blended the
 * two results, and the ending followed the milestone. The cause, in
 * production's request: the turn is told to continue exactly where the
 * previous beat ended, to take "Whatever happened in the beat text" as
 * established and to make the milestone specific "based on the thread's
 * narrative text"; nothing says that a choice which changes course holds over
 * the earlier text, results and facts that point the other way. In the second
 * round the chosen result changed direction from the step before on about 25
 * turns; this was the one told as the other.
 *
 * The variant is production's turn today (choiceResultRequest: the exploration
 * line on an exploration step, production's request everywhere else) with:
 * - where the turn narrates an exploration step's recorded result (a chapter
 *   step after one, a switch turn or ending after a chapter with an
 *   exploration thread), a line after the narrative-feedback line: the chosen
 *   resolution is what the player did, the text shows it and the facts follow
 *   it; where earlier texts, results or facts point another way, the player
 *   changes course, shown, never folded back or blended;
 * - where the turn also writes that chapter's milestone (the switch turn and
 *   the ending), a line after the milestone lines: the milestone is the chosen
 *   resolution made more specific from the thread's text, which holds where
 *   that text points another way.
 * Everywhere else production's request byte for byte; the schema is
 * production's. Every player count: the lines read per thread.
 */

const LABEL = "Recorded-result turn";

/** The narrative-feedback line the narrate line follows (every turn after the first prints it). */
const NARRATE_ANCHOR = "- There should always be clear narrative feedback for players' decisions.";

const NARRATE_LINE =
  "- In an Exploration thread, the previous beat's resolution is the option the player chose, and the game has recorded it as what the player did: the text shows the player doing it, and every fact this beat records follows it. Where the earlier beat texts, an earlier step's resolution or a recorded fact point another way (something kept back, paused or refused), the player now changes course: show the change, and never fold the choice back into the earlier course or blend it with another resolution.";

/** The milestone lines' last line, after which the milestone line goes (switch turns after a chapter and endings print it). */
const MILESTONE_ANCHOR = "the council has no choice but to approve the new railroad.'\n";

const MILESTONE_LINE =
  "--- In an Exploration thread, the milestone is the resolution the player chose, made more specific from the thread's text; where that text or an earlier step points another way, the chosen resolution holds, never another resolution or a blend of two.\n";

/** The passages the tests pin. */
export const RECORDED_RESULT_TEXT = {
  narrateAnchor: NARRATE_ANCHOR,
  narrateLine: NARRATE_LINE,
  milestoneAnchor: MILESTONE_ANCHOR,
  milestoneLine: MILESTONE_LINE,
};

/**
 * The exploration threads whose latest recorded result this turn narrates: on
 * a chapter step after the chapter's first, the current chapter's; on a switch
 * turn or the ending after a chapter, the ended chapter's. None on the first
 * turn or a chapter's first step (a switch pick is no step's result).
 */
export function recordedExplorationThreads(story: Story): Thread[] {
  if (story.isFirstBeat()) return [];
  const type = story.getCurrentBeatType();
  const analysis =
    type === "thread" ? (story.getCurrentThreadBeatsCompleted() > 0 ? story.getCurrentThreadAnalysis() : null) : type === "switch" || type === "ending" ? story.getResolvedThreadAnalysis() : null;
  return (analysis?.threads ?? []).filter((thread) => getThreadType(thread) === "exploration" && thread.progression.some((step) => step.resolution !== null));
}

/** Whether the turn takes the variant's lines: it narrates an exploration step's recorded result. */
export function takesRecordedResult(story: Story): boolean {
  return recordedExplorationThreads(story).length > 0;
}

/** Production's turn with the narrate line, and the milestone line where the turn writes the chapter's milestone; production's request byte for byte elsewhere. */
export function recordedResultRequest(story: Story): TextRequest {
  const base = choiceResultRequest(story);
  if (!takesRecordedResult(story)) return base;
  const { instructions, state } = splitAtState(LABEL, base.prompt);
  let edited = replaceOnce(LABEL, instructions, NARRATE_ANCHOR, `${NARRATE_ANCHOR}\n${NARRATE_LINE}`);
  if (story.getCurrentBeatType() !== "thread") edited = replaceOnce(LABEL, edited, MILESTONE_ANCHOR, `${MILESTONE_ANCHOR}${MILESTONE_LINE}`);
  return { ...base, prompt: edited + state };
}
