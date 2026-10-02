import type { z } from "zod";
import type { Story } from "core/models/Story.js";
import { RESULT_LABELS_TEXT, takesResultLabels } from "../resultLabels.js";
import { beatStep, type TextRequest } from "../storyTextSteps.js";
import { replaceOnce } from "./roundEdits.js";

/*
 * Result words in the story text (eval only; decision A's result-words fix,
 * the coordinator's brief of 2026-10-02: "no game words in the story text such
 * as 'the mixed result'").
 *
 * The cause, read from every stored playthrough of rounds 1-3 and the requests
 * those turns sent (a temporary probe over playthroughs.json, -2.json and
 * -3.json, replayed with playthroughReplay.ts, each turn's sent request read
 * from prompts/; deleted; no calls). Production's note (resultWordsInText,
 * beatRepairs.ts) finds the game's result kinds in 9 player texts of about 500
 * group texts and in none of 133 single-player texts: 6 of 229 on a group's
 * later chapter steps, 3 of 123 on group switches after a chapter, none of 123
 * on a chapter's opening step (which narrates a choice, no rolled result) and
 * none of 19 endings (which carry "the text never mentions milestones,
 * outcomes or resolutions" since 2026-09-30). Every one renders the previous
 * result's label and its description as one sentence: the request shows each
 * result to narrate under its label, right after the player's last beat text
 * ("RESOLUTION: MIXED. The schedule is visible, but the crew finds gaps in how
 * a review would be triggered."), in the beat progression ("(PREVIOUS BEAT,
 * resolution was determined and must now be narrated) ... Resolution: MIXED.")
 * and at a switch as "Thread Resolution: MIXED"; the text rules ask the turn to
 * set its tone by whether the previous beat "was favorable / mixed /
 * unfavorable"; and the fourth-wall rule names only 'NPC', 'player character',
 * 'stat' and 'story beat'. Round 3's space pirates' turn 16 wrote "The mixed
 * result remains plain in the room: your dates can be checked, but the urgent
 * procedure has not yet earned the crew's confidence" from that MIXED line, and
 * "The unfavorable outcome hangs between you: they have examined the claim ..."
 * from "RESOLUTION: UNFAVORABLE. The contact sees the entries but cannot tell
 * ...". The story's own summaries and facts with result words written by
 * earlier turns don't predict it (flagged turns 2 of 81 where they hold such
 * words, 5 of 124 where they don't). Luna low writes group turns, Luna medium
 * a single player's, the same lines in both.
 *
 * The variant: production's group turn with one line under the fourth-wall
 * rule, in the words the ending's rule already uses (ENDING_OUTCOME_KINDS: "tell
 * it in the story's own words"), on a group turn that narrates a result (a
 * later chapter step, a switch after the story's first beat). The labels stay
 * where the turn reads them: they say which result to narrate. Everywhere else
 * production's request byte for byte.
 *
 * Adopted after the run of 2026-10-02 as measured: on the seven group turns of
 * rounds 2 and 3 that named a kind, twice, turns naming one by the game's note
 * 4 of 14 -> 0 of 14 (moved, p 0.049), by hand, blind, 6 of 14 -> 1 of 14
 * (moved, p 0.038). Production prints the line (resultLabels.ts:
 * RESULT_LABELS_TEXT, takesResultLabels; BeatPromptService), and the kept test
 * holds production to this variant byte for byte. The variant builds on
 * production with the line taken out (resultWordsBase, withoutResultWordsLine),
 * so it still builds as measured.
 */

const LABEL = "Result-words variant";

/** The passages the tests pin: production's (resultLabels.ts), one copy. */
export const RESULT_WORDS_TEXT = RESULT_LABELS_TEXT;
const { anchor: ANCHOR, line: LINE } = RESULT_WORDS_TEXT;

/** Whether a turn takes the line: a group turn that narrates a result, a later chapter step or a switch after the story's first beat (production's). */
export const takesResultWordsLine = takesResultLabels;

/** A turn prompt with the line after the fourth-wall rule's terms where the turn takes it; as it is elsewhere. */
export function withResultWordsLine(prompt: string, story: Story): string {
  return takesResultWordsLine(story) ? replaceOnce(LABEL, prompt, ANCHOR, `${ANCHOR}${LINE}`) : prompt;
}

/** A turn prompt with the line taken out (a prompt without it, as it is). */
export function withoutResultWordsLine(prompt: string, story: Story): string {
  return takesResultWordsLine(story) ? prompt.split(`${ANCHOR}${LINE}`).join(ANCHOR) : prompt;
}

/** Production's turn as the stage measured it beside the variant (the variant's base): production's with the line taken out since the adoption. */
export function resultWordsBase(story: Story): TextRequest<z.AnyZodObject> {
  const production = beatStep.request(story);
  return { ...production, prompt: withoutResultWordsLine(production.prompt, story) };
}

/** The variant's turn: production's with the line where a group turn narrates a result. */
export function resultWordsRequest(story: Story): TextRequest<z.AnyZodObject> {
  const base = resultWordsBase(story);
  return { ...base, prompt: withResultWordsLine(base.prompt, story) };
}
