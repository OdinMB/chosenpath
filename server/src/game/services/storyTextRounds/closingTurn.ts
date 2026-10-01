import { z } from "zod";
import type { Story } from "core/models/Story.js";
import { beatStep, canAddMilestones, type TextRequest } from "../storyTextSteps.js";
import { ENDING_MILESTONES_PLAYED } from "../prompts/BeatPromptService.js";
import { replaceOnce, splitAtState } from "./roundEdits.js";

/*
 * The runaway turn, second attempt (eval only; the coordinator's brief of
 * 2026-10-01: "another attempt at the reasoning-runaway turn's cause").
 *
 * What the stored records show (calls.jsonl and the playthroughs, read with a
 * temporary probe, no calls):
 * - Every GPT-6 reply the eval ever cut at production's output cap fell on a
 *   turn that closes a chapter: a switch turn after a chapter, or the ending.
 *   On Luna medium since 29 September, 15 of 192 such first tries (12 of 121
 *   switch turns, 3 of 71 endings), and 2 more in the playthroughs (a switch
 *   turn, an ending); none of 639 chapter steps and openings, none of 40 first
 *   turns. None of the 145 closing turns ever sent on Luna low (groups), 88 of
 *   them since 29 September. Six story moments, not one: Novi Reg after its
 *   first chapter, the lemonade story's switch turn 4 and ending, the mouse
 *   story's switch turn 5 and ending, New Avalon's switch turn 5.
 * - It is a loop, not a hard question: the replies that answer think less on a
 *   closing turn than on a chapter step (median 1,479 and 1,390 reasoning
 *   tokens against about 1,900; the longest 3,025), and a runaway thinks all
 *   12,000 and writes nothing.
 * - It began around 29 September: before then 1 of 143 closing first tries on
 *   Luna medium ran away (B9's split form, 28 September), every form of the
 *   same moments included, against 15 of 192 since. On Novi Reg's switch turn
 *   the identical request production sends answered twice on 28 September and
 *   ran away 4 times in 7 first tries after. The same prompts' answered
 *   replies came back about a quarter faster after 29 September: something on
 *   the server side changed, and it made this failure possible.
 *
 * Production's closing turn differs from every other turn in two blocks of its
 * stat-changes section, printed only where a chapter just ended
 * (BeatPromptService):
 * - THREAD RESOLUTION: the after-thread stat audit ("all stats can change", each
 *   stat's "Adjustments after threads"), where a chapter step reads "Only stats
 *   that are marked as 'Can be adjusted anytime' can be changed (except for
 *   rewards and sacrifices)"; the statChanges field adds "If an entire thread
 *   was just resolved, remember to check all stat's 'adjustments after
 *   threads'", a sentence every turn carries and only a closing turn meets;
 * - NEW MILESTONES: the model writes the chapter's milestone into the reply's
 *   newMilestones list (every other turn sends newMilestones as "").
 *
 * The two diagnostic variants each take one block out of production's
 * single-player closing turn, production's request byte for byte otherwise and
 * on every other turn:
 * - noThreadAuditRequest: the audit replaced by a chapter step's stat line, and
 *   the statChanges field without its after-thread sentence;
 * - noNewMilestonesRequest: no NEW MILESTONES block (nor the ending's line on
 *   what was played), and newMilestones as "" (the engine then records the
 *   chapter's planned milestone, its existing fallback).
 * Neither is a form to adopt: each tells which block the loop needs.
 *
 * Run of 2026-10-01 (stage runaway-2, sixteen each on Novi Reg's switch turn):
 * production ran away 1 time in 16, each diagnostic 0 in 16, which can tell
 * nothing apart (4 in 7 on 30 September). The answered replies' reasoning:
 * production's mean 1,767 tokens, noThreadAudit 1,758 (the model audits from
 * the stat definitions anyway), noNewMilestones 1,417 (moved lower). Nothing
 * adopted; the milestone block is the lead for a later attempt.
 */

const LABEL = "Closing turn";

/** The after-thread stat audit, as production prints it right after the lever rules on a closing turn. */
const THREAD_AUDIT =
  "\nTHREAD RESOLUTION\n" +
  "- The previous thread (or set of threads) was just resolved, so some meaningful stat changes might be warrented.\n" +
  "- Consider what was at stake in the previous thread and the thread's resolution.\n" +
  "- Stats define how they should be adjusted after threads. Consider the 'Adjustments after threads' parameter in the stat definitions.\n" +
  "- Because it's the end of a thread, all stats can change, not just the ones that are marked as 'Can be adjusted anytime'.\n";

/** A chapter step's stat line, in the audit's place. */
const CHAPTER_STAT_LINE = "- Only stats that are marked as 'Can be adjusted anytime' can be changed (except for rewards and sacrifices). Even then, keep the changes minor.\n";

/** The milestone block, as production prints it right after the audit (the ending adds its line on what was played). */
const NEW_MILESTONES =
  "\nNEW MILESTONES: To resolve the previous set of threads, for each outcome associated with these resolved threads, add a milestone based on the thread's resolution with a newMilestone change.\n" +
  "- Take the threads' resolution text as a baseline. Adjust it based on the thread's narrative text to make the new milestone more specific. Example: if the thread's general resolution is 'The council's decision heavily favors progress', based on the thread's narrative, the new milestone could be 'Threatened by the Furious Four, the council has no choice but to approve the new railroad.'\n";

/** The statChanges field's after-thread sentence (core's beat schema, every turn). */
const AFTER_THREADS_SENTENCE = " If an entire thread was just resolved, remember to check all stat's 'adjustments after threads' parameters (more meaningful changes to stats might be warrented).";

/** The passages the tests pin. */
export const CLOSING_TURN_TEXT = { threadAudit: THREAD_AUDIT, chapterStatLine: CHAPTER_STAT_LINE, newMilestones: NEW_MILESTONES, afterThreadsSentence: AFTER_THREADS_SENTENCE };

/** Whether the turn closes a chapter: a switch turn after a chapter, or the ending (the turns that write milestones). */
export function closesChapter(story: Story): boolean {
  return canAddMilestones(story);
}

/** Production's single-player turn; a closing turn's request edited by `edit`, every other turn byte for byte. */
function closingTurnRequest(story: Story, edit: (request: TextRequest<z.AnyZodObject>) => TextRequest<z.AnyZodObject>): TextRequest<z.AnyZodObject> {
  if (story.isMultiplayer()) throw new Error(`${LABEL}: single-player (every runaway was one player's turn)`);
  const production = beatStep.request(story);
  return closesChapter(story) ? edit(production) : production;
}

/** A closing turn without the after-thread stat audit: a chapter step's stat line in its place, the field's after-thread sentence cut. */
export function noThreadAuditRequest(story: Story): TextRequest<z.AnyZodObject> {
  return closingTurnRequest(story, ({ prompt, schema }) => {
    const { instructions, state } = splitAtState(LABEL, prompt);
    const statChanges = schema.shape.statChanges as z.ZodArray<z.ZodTypeAny>;
    return {
      prompt: replaceOnce(LABEL, instructions, THREAD_AUDIT, CHAPTER_STAT_LINE) + state,
      schema: schema.extend({ statChanges: statChanges.describe(replaceOnce(LABEL, statChanges.description ?? "", AFTER_THREADS_SENTENCE, "")) }),
    };
  });
}

/** A closing turn that writes no milestone: no milestone block (nor the ending's played line), newMilestones as every other turn sends it. */
export function noNewMilestonesRequest(story: Story): TextRequest<z.AnyZodObject> {
  return closingTurnRequest(story, ({ prompt, schema }) => {
    const { instructions, state } = splitAtState(LABEL, prompt);
    const block = NEW_MILESTONES + (story.getCurrentBeatType() === "ending" ? ENDING_MILESTONES_PLAYED : "");
    return { prompt: replaceOnce(LABEL, instructions, block, "") + state, schema: schema.extend({ newMilestones: z.literal("") }) };
  });
}
