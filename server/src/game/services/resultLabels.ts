import type { Story } from "core/models/Story.js";

/*
 * Each result told in the story's own words, never by its label (adopted
 * 2026-10-02 from the result-words stage, decision A's result-words fix; the
 * eval's resultWords, storyTextRounds/resultWords.ts, which measured it).
 *
 * Group turns of the second and third playthroughs told the game's result kind
 * as story text ("The mixed result remains plain in the room", "The
 * unfavorable outcome hangs between you"): the turn request shows each result
 * to narrate under its label ("RESOLUTION: MIXED. <what it means>" after the
 * player's last beat text, "Resolution: MIXED." in the beat progression,
 * "Thread Resolution: MIXED" at a switch) and asks the turn to set its tone by
 * whether the previous beat "was favorable / mixed / unfavorable", while the
 * fourth-wall rule named only 'NPC', 'player character', 'stat' and 'story
 * beat'. Luna low, which writes group turns, rendered label and description as
 * one sentence; a single player's turns (Luna medium, the same lines) never
 * did in three rounds of playthroughs.
 *
 * A group turn that narrates a result (a later chapter step, a switch after
 * the story's first beat) carries one line under the fourth-wall rule, in the
 * words the ending's rule already uses. Measured on the seven group turns of
 * rounds 2 and 3 that named a kind, twice beside production: turns naming a
 * kind by the game's note 4 of 14 -> 0 of 14 (moved, p 0.049), by hand, blind,
 * 6 of 14 -> 1 of 14 (moved, p 0.038). Every other turn is unchanged; the
 * ending keeps its own line (ENDING_OUTCOME_KINDS).
 */

/** The fourth-wall rule's terms: the line goes right after them. */
const ANCHOR = "--- Don't use terms like 'NPC', 'player character', 'stat', 'story beat', etc. in the beat text.\n";

const LINE = "--- Tell each result in the story's own words: the text, the options and the interludes never name a result's kind (favorable, mixed, unfavorable, Side A or Side B).\n";

/** The passages BeatPromptService prints and the tests pin. */
export const RESULT_LABELS_TEXT = { anchor: ANCHOR, line: LINE } as const;

/** Whether a turn takes the line: a group turn that narrates a result, a later chapter step or a switch after the story's first beat. */
export function takesResultLabels(story: Story): boolean {
  if (!story.isMultiplayer() || story.isFirstBeat()) return false;
  const type = story.getCurrentBeatType();
  return type === "switch" || (type === "thread" && story.getCurrentThreadBeatsCompleted() > 0);
}
