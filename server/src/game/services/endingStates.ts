import type { Story } from "core/models/Story.js";
import { outcomeState, outcomesInPlay, type OutcomeState } from "core/utils/outcomeStates.js";

export type { OutcomeState };

/*
 * Where each outcome stands once the ending's milestones are added (the
 * owner's decision of 2026-09-30: each outcome is told at the ending as its
 * milestones leave it; measured as the eval's endingStateB). The ending adds
 * one milestone per thread of the chapter that just ended, on that thread's
 * outcome, which the state's "Milestones (k / n to resolution)" leaves out, so
 * the ending's prompt states each outcome's standing. The last chapter settles
 * only its outcome's next stage (planner v2e), so an ending meets outcomes its
 * milestones haven't finished. Since the owner's decision of 2026-10-01 ("Only
 * what was played") the beat repairs keep no other milestone the ending writes
 * (milestoneNotPlayed in beatRepairs.ts), so these counts are what the ending
 * leaves: once it is written, each player's state carries them as recorded
 * (ClientStateManager's outcomesAtEnd).
 */

/**
 * Each outcome of the story after the ending's milestones: its recorded
 * milestones plus one for every thread of the chapter that just ended on it,
 * complete once that reaches its intended number (an aftermath beyond it
 * too). Shared outcomes first, then each player's; an id already read (a
 * shared outcome a template copied into a player's list) is read once.
 * Nothing before the ending.
 */
export function outcomeStatesAtEnding(story: Story): OutcomeState[] {
  if (story.getCurrentBeatType() !== "ending") return [];
  const resolved = story.getResolvedThreadAnalysis()?.threads ?? [];
  const added = (id: string) => resolved.filter((thread) => thread.outcomeId === id).length;
  return outcomesInPlay(story.getState()).map(({ owner, outcome }) => outcomeState(owner, outcome, added(outcome.id)));
}

/** The ending prompt's two standing lines: the complete outcomes and the unfinished ones; a player's own outcome carries its seat in a group. */
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
