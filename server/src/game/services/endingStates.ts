import type { Story } from "core/models/Story.js";

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
 * leaves.
 */

/** Where an outcome stands once this beat's milestones are added: shared, or a player's own (by seat). */
export type OutcomeState = { id: string; owner: string; milestones: number; intended: number; complete: boolean };

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
