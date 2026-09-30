import type { Story } from "core/models/Story.js";
import type { TextRequest } from "../storyTextSteps.js";
import { productionTurnToday } from "./choiceResult.js";
import { outcomeStatesAtEnding, type OutcomeState } from "./endingState.js";
import { replaceOnce, splitAtState } from "./roundEdits.js";

/*
 * The turn that completes an outcome, and the ending (eval only; the second
 * playthroughs' review of 2026-09-30, the coordinator's fix 1). Found in the
 * stored stories:
 * - The space pirates' switch turn 14 wrote the treasure claim's completing
 *   milestone (2 of 2: the captain's camp secures the claim; Pip's proposal
 *   does not replace it), yet its texts told the claim as "open and
 *   unsettled", and it stored a fact that the crew's "provisional" record
 *   "does not settle" Pip's proposal, beside facts from turns 9 and 13 calling
 *   the division provisional. All three endings followed the facts ("the
 *   Cache's final claim remain beyond this night"), though the ending's
 *   request named the claim complete.
 * - New Avalon's switch turn 16 wrote the parting milestone of Jun and Orin
 *   (their outcome's third resolution, 2 of 2) and in the same reply set their
 *   relationship stat to its closest level, "Deeply Trusted", whose own line is
 *   the first resolution's; every later turn and the ending read it as
 *   renewed trust.
 * The cause, in production's request: a switch turn is told to add each ended
 * chapter's milestone, and the state shows the outcome at "1 / 2", but nothing
 * says that this milestone completes it; the chapter's own last turn, the
 * earlier milestone and the stored facts all call it open. Nothing says a stat
 * change has to agree with the milestone beside it; the stat's own adjustment
 * rule ("one step up after a favorable thread that offers honest care") is
 * the only rule the turn reads. And the ending, which the game tells which
 * outcomes are complete, reads every fact and summary written before.
 *
 * The variant is production's turn (productionTurnToday, built from the
 * frozen copy through the measured forms) with:
 * - on a switch turn after a chapter and at the ending (the turns that add
 *   milestones), a stat line after the thread-resolution lines: no stat change
 *   contradicts a milestone the beat adds, even where the stat's adjustments
 *   after threads point elsewhere;
 * - on a switch turn whose milestones complete an outcome, after the milestone
 *   lines, the outcomes this beat completes (the game's count, as the ending's
 *   standing lines give it) and that a complete outcome is settled: its
 *   milestone written without softening the thread's resolution, and every
 *   player's text and every fact the beat records tell it as settled, never
 *   open or provisional; earlier milestones, facts and summaries that call it
 *   open were written before it was settled;
 * - at an ending with a complete outcome, after the outcome lines: its
 *   milestones hold over an earlier milestone, fact, summary or stat level
 *   that calls it open or points to another resolution.
 * Everywhere else production's request byte for byte; the schema is
 * production's. Every player count.
 */

const LABEL = "Outcome settled";

/** The thread-resolution line the stat line follows (switch turns after a chapter and endings print it). */
const STAT_ANCHOR = "- Because it's the end of a thread, all stats can change, not just the ones that are marked as 'Can be adjusted anytime'.\n";

const STAT_LINE =
  "- No stat change contradicts a milestone this beat adds. Where a stat's levels say how an outcome turned out (a bond, a standing, a reputation), set it where the milestone leaves it, even if the stat's adjustments after threads point elsewhere: beside a milestone where two friends go their separate ways, their bond does not rise to its closest level.\n";

/** The milestone lines' last line, after which the completion lines go (switch turns after a chapter and endings print it). */
const MILESTONE_ANCHOR = "the council has no choice but to approve the new railroad.'\n";

const SETTLED =
  "--- A complete outcome is settled. Write its milestone as the thread's resolution settles it, without softening it, and tell it as settled in every player's text and in every fact this beat records: never as open, provisional, undecided or still to be settled.\n";
const EARLIER_OPEN =
  "--- Earlier milestones, facts and summaries that call it open were written before it was settled: this beat's milestone settles it, so don't carry them forward.\n";

/** The ending's outcome line the ending line follows (production's ending, endingStateB, prints it). */
const ENDING_ANCHOR = "--- Either way, tell it in the story's own words: the text never mentions milestones, outcomes or resolutions.\n";

const ENDING_LINE =
  "--- A complete outcome is settled by its milestones, the last one above all. Where an earlier milestone, a recorded fact, a summary or a stat's level calls it open, provisional or unsettled, or points to another resolution, that was written before it was settled: follow the milestones.\n";

/**
 * The one fix-and-retest (outcomeSettledB, after the run of 2026-09-30): the
 * variant's milestones copied the plan's resolution word for word (the
 * automatic check milestoneNotCopied, one player: 91.7% -> 25.0%, moved lower),
 * where production's milestone lines ask for it made specific from the
 * thread's text: "Write its milestone as the thread's resolution settles it"
 * read as "write the resolution", and at the ending "follow the milestones" as
 * the same. The settled line asks for the milestone made specific as the line
 * above it says, keeping all the resolution settles; the ending line tells the
 * outcome as its milestones leave it, the ending rule's own words.
 */
const SETTLED_SPECIFIC =
  "--- A complete outcome is settled. Its milestone, made specific from the thread's text as the line above asks, keeps everything the thread's resolution settles and softens none of it; every player's text and every fact this beat records tell it as settled: never as open, provisional, undecided or still to be settled.\n";
const ENDING_LINE_SPECIFIC =
  "--- A complete outcome is settled by its milestones, the last one above all. Where an earlier milestone, a recorded fact, a summary or a stat's level calls it open, provisional or unsettled, or points to another resolution, that was written before it was settled: tell the outcome as its milestones leave it.\n";

/** The passages the tests pin. */
export const OUTCOME_SETTLED_TEXT = {
  statAnchor: STAT_ANCHOR,
  statLine: STAT_LINE,
  milestoneAnchor: MILESTONE_ANCHOR,
  settled: SETTLED,
  settledSpecific: SETTLED_SPECIFIC,
  earlierOpen: EARLIER_OPEN,
  endingAnchor: ENDING_ANCHOR,
  endingLine: ENDING_LINE,
  endingLineSpecific: ENDING_LINE_SPECIFIC,
};

/** The form: the run's lines (outcomeSettled), or its fix-and-retest keeping the completing milestone specific (outcomeSettledB). */
export type OutcomeSettledForm = { specificMilestone?: boolean };

/** A turn that adds milestones: a switch turn after a chapter, or the ending (the thread-resolution lines print there). */
function addsMilestones(story: Story): boolean {
  if (story.isFirstBeat()) return false;
  return story.getCurrentBeatType() === "switch" || story.getCurrentBeatType() === "ending";
}

/**
 * The outcomes a switch turn's milestones complete: those the ended chapter
 * brings to their intended count (its recorded milestones plus one per thread
 * of the chapter on it, as the ending's standing counts them) that held fewer
 * before, so an aftermath on an outcome already complete is not one. None on
 * any other turn: the ending states its own standing.
 */
export function outcomesCompletedThisBeat(story: Story): OutcomeState[] {
  if (story.isFirstBeat() || story.getCurrentBeatType() !== "switch" || !story.getResolvedThreadAnalysis()) return [];
  const recorded = (id: string) => story.getOutcomeById(id)?.milestones?.length ?? 0;
  return outcomeStatesAtEnding(story).filter((state) => state.complete && state.milestones > recorded(state.id) && recorded(state.id) < state.intended);
}

/** The completion lines of a switch turn: the outcomes it completes, with the game's count, and what that means; empty where it completes none. */
export function completionLines(story: Story, form: OutcomeSettledForm = {}): string {
  const completed = outcomesCompletedThisBeat(story);
  if (completed.length === 0) return "";
  const group = story.isMultiplayer();
  const item = (s: OutcomeState) => {
    const owner = s.owner === "shared" ? "shared, " : group ? `${s.owner}, ` : "";
    return `${s.id} (${owner}${s.milestones} of ${s.intended} milestones)`;
  };
  return `- This beat's milestones complete these outcomes: ${completed.map(item).join(", ")}.\n${form.specificMilestone ? SETTLED_SPECIFIC : SETTLED}${EARLIER_OPEN}`;
}

/** Whether an ending takes the ending line: some outcome is complete after its milestones. */
export function takesSettledEnding(story: Story): boolean {
  return story.getCurrentBeatType() === "ending" && outcomeStatesAtEnding(story).some((state) => state.complete);
}

/**
 * Production's turn with the stat, completion and ending lines where they
 * apply (the run's lines, or with the fix-and-retest's settled and ending
 * lines); production's request byte for byte elsewhere.
 */
export function outcomeSettledRequest(story: Story, form: OutcomeSettledForm = {}): TextRequest {
  const base = productionTurnToday(story);
  if (!addsMilestones(story)) return base;
  const { instructions, state } = splitAtState(LABEL, base.prompt);
  let edited = replaceOnce(LABEL, instructions, STAT_ANCHOR, `${STAT_ANCHOR}${STAT_LINE}`);
  const completion = completionLines(story, form);
  if (completion) edited = replaceOnce(LABEL, edited, MILESTONE_ANCHOR, `${MILESTONE_ANCHOR}${completion}`);
  const endingLine = form.specificMilestone ? ENDING_LINE_SPECIFIC : ENDING_LINE;
  if (takesSettledEnding(story)) edited = replaceOnce(LABEL, edited, ENDING_ANCHOR, `${ENDING_ANCHOR}${endingLine}`);
  return { ...base, prompt: edited + state };
}
