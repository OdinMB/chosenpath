import type { Story } from "core/models/Story.js";
import { contestsPlayable, isContestedOutcome } from "core/utils/outcomeReadiness.js";
import type { TextRequest } from "../storyTextSteps.js";
import { round0BeatStep } from "../storyTextRound0/round0Steps.js";
import { replaceOnce, splitAtState } from "./roundEdits.js";

/*
 * The ending told as its milestones leave it (eval only; the owner's decision
 * of 2026-09-30 on the story's last chapter: "Unfinished outcomes should be
 * narrated in their current state, even if that state is inconclusive"). The
 * last chapter settles only its outcome's next stage (planner v2e), so an
 * ending can meet outcomes its milestones haven't finished, and production's
 * ending, which asks only to "touch on" each outcome, resolves them anyway
 * (the stored endings land an outcome no chapter pushed on one of its
 * possible resolutions). The variant keeps production's ending (today's form,
 * with the scoreboard rule on a scored contest's ending, built here from the
 * frozen round0 copy so no later production change moves it) and replaces its
 * outcome lines:
 * - each outcome is told as its milestones leave it, counting the milestones
 *   this beat adds, and the game states which outcomes are complete and which
 *   unfinished after this beat (outcomeStatesAtEnding), since the count the
 *   state shows leaves out the one the ending itself adds;
 * - a complete outcome is resolved as its milestones point; an unfinished one
 *   is told in its current state, even if inconclusive, never beyond its
 *   milestones;
 * - a contest's scoreboard rule gains its unfinished half: nobody has won,
 *   the side ahead (or neither, 45 to 55) is told as ahead.
 * The held ending format (B8: its own reply fields, an outcome without
 * milestones ending mixed) stays out. Endings only; the schema is production's.
 */

const LABEL = "Ending state";

/** The line the outcome lines follow in production's ending branch (and in the frozen copy's). */
const SHARED_OUTCOMES_LINE = "--- For shared outcomes, touch on how the outcome affects the other players.\n";

/**
 * The scoreboard ending rule as production sends it since its adoption of
 * 2026-09-28 (decision 3; measured by no round), copied so the base stays what
 * was measured whatever production sends later.
 */
const MEASURED_SCOREBOARD_RULE =
  "- For a contested outcome, the side ahead on its scoreboard wins unless its milestones clearly say otherwise; a score between 45 and 55 is a draw (the mixed resolution). The scoreboard is the shared opposites stat its resonance names (\"Scored by …\"), and its first side is side A (with three players, player1's camp).\n";

const TELL_AS_LEFT = "- Tell each outcome as its milestones leave it, counting the milestones this beat adds.\n";
const COMPLETE = "--- A complete outcome is resolved: narrate the possible resolution its milestones point to.\n";
const UNFINISHED =
  "--- An unfinished outcome is told in its current state, even if that state is inconclusive: what its milestones so far have settled, and what is still open. Never resolve it beyond its milestones: none of its possible resolutions has been reached yet.\n";
const CONTEST_RULE =
  "- For a contested outcome, once it is complete, the side ahead on its scoreboard wins unless its milestones clearly say otherwise; a score between 45 and 55 is a draw (the mixed resolution). While it is unfinished, no side has won yet: tell which side is ahead (neither, between 45 and 55) and that the contest isn't settled. The scoreboard is the shared opposites stat its resonance names (\"Scored by …\"), and its first side is side A (with three players, player1's camp).\n";

/** The passages the tests pin. */
export const ENDING_STATE_TEXT = {
  sharedOutcomesLine: SHARED_OUTCOMES_LINE,
  measuredScoreboardRule: MEASURED_SCOREBOARD_RULE,
  tellAsLeft: TELL_AS_LEFT,
  complete: COMPLETE,
  unfinished: UNFINISHED,
  contestRule: CONTEST_RULE,
};

/**
 * Whether an ending takes the scoreboard rule, as production decides it: a
 * story that plays contests (two or more players, competitive or
 * cooperative-competitive), a contested shared outcome, and a shared
 * opposites stat to keep its score.
 */
export function scoreboardEnding(story: Story): boolean {
  return (
    story.getCurrentBeatType() === "ending" &&
    contestsPlayable(story.getGameMode(), story.getNumberOfPlayers()) &&
    story.getSharedOutcomes().some(isContestedOutcome) &&
    story.getSharedStats().some((stat) => stat.type === "opposites")
  );
}

function mustBeEnding(story: Story): void {
  if (story.getCurrentBeatType() !== "ending") throw new Error(`${LABEL}: builds the ending only (this turn is a ${story.getCurrentBeatType()})`);
}

/**
 * Production's ending as the eval measured it: today's form (the frozen
 * round0 copy; the option rules and the switch turn's chapter rules touch no
 * ending) with the scoreboard rule after the shared outcomes' line on a
 * scored contest's ending.
 */
export function productionEndingForm(story: Story): TextRequest {
  mustBeEnding(story);
  const today = round0BeatStep.request(story);
  if (!scoreboardEnding(story)) return today;
  const { instructions, state } = splitAtState(LABEL, today.prompt);
  return { ...today, prompt: replaceOnce(LABEL, instructions, SHARED_OUTCOMES_LINE, `${SHARED_OUTCOMES_LINE}${MEASURED_SCOREBOARD_RULE}`) + state };
}

/** Where an outcome stands once this beat's milestones are added: shared, or a player's own (by seat). */
export type OutcomeState = { id: string; owner: string; milestones: number; intended: number; complete: boolean };

/**
 * Each outcome of the story after the ending's milestones: its recorded
 * milestones plus one for every thread of the chapter that just ended on it
 * (the ending adds a milestone per resolved thread's outcome), complete once
 * that reaches its intended number. Shared outcomes first, then each
 * player's; an id already listed (a shared outcome copied into a player's
 * list) is read once.
 */
export function outcomeStatesAtEnding(story: Story): OutcomeState[] {
  const resolved = story.getResolvedThreadAnalysis()?.threads ?? [];
  const added = (id: string) => resolved.filter((thread) => thread.outcomeId === id).length;
  const lists = [
    { owner: "shared", outcomes: story.getSharedOutcomes() },
    ...story.getPlayerSlots().map((slot) => ({ owner: slot, outcomes: story.getPlayer(slot)?.outcomes ?? [] })),
  ];
  const seen = new Set<string>();
  return lists.flatMap(({ owner, outcomes }) =>
    outcomes.flatMap((outcome): OutcomeState[] => {
      if (seen.has(outcome.id)) return [];
      seen.add(outcome.id);
      const milestones = (outcome.milestones?.length ?? 0) + added(outcome.id);
      const intended = outcome.intendedNumberOfMilestones;
      return [{ id: outcome.id, owner, milestones, intended, complete: milestones >= intended }];
    })
  );
}

/** One line of the complete outcomes and one of the unfinished ones; a player's own outcome carries its seat in a group. */
export function outcomeStateLines(story: Story): string {
  const states = outcomeStatesAtEnding(story);
  const group = story.isMultiplayer();
  const item = (s: OutcomeState) => {
    const owner = s.owner === "shared" ? "shared, " : group ? `${s.owner}, ` : "";
    return `${s.id} (${owner}${s.milestones} of ${s.intended} milestones)`;
  };
  const line = (label: string, list: OutcomeState[]) => `--- ${label} after this beat: ${list.length ? list.map(item).join(", ") : "none"}.\n`;
  return line("Complete", states.filter((s) => s.complete)) + line("Unfinished", states.filter((s) => !s.complete));
}

/** Production's ending with its outcome lines replaced: each outcome told as its milestones leave it. */
export function endingStateRequest(story: Story): TextRequest {
  const base = productionEndingForm(story);
  const { instructions, state } = splitAtState(LABEL, base.prompt);
  const measured = `${SHARED_OUTCOMES_LINE}${scoreboardEnding(story) ? MEASURED_SCOREBOARD_RULE : ""}`;
  const block = `${SHARED_OUTCOMES_LINE}${TELL_AS_LEFT}${outcomeStateLines(story)}${COMPLETE}${UNFINISHED}${scoreboardEnding(story) ? CONTEST_RULE : ""}`;
  return { ...base, prompt: replaceOnce(LABEL, instructions, measured, block) + state };
}
