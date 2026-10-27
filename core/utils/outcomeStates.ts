import type { Outcome } from "../types/outcome.js";
import type { PlayerSlot } from "../types/player.js";
import type { StoryState } from "../types/story.js";

/*
 * Where a story's outcomes stand: each outcome's milestones against the
 * number it intends. The ending's prompt reads them before the ending's
 * milestones are recorded, adding them (outcomeStatesAtEnding in
 * server/src/game/services/endingStates.ts); a player's state at the end reads
 * them once they are, adding none (ClientStateManager).
 */

/** Where an outcome stands: shared, or a player's own (by seat). */
export type OutcomeState = { id: string; owner: string; milestones: number; intended: number; complete: boolean };

/** An outcome and whose it is: "shared", or the seat whose own it is. */
export type OutcomeInPlay = { owner: "shared" | PlayerSlot; outcome: Outcome };

/**
 * The story's outcomes: the shared ones first, then each seat's own in turn,
 * every seat unless `seats` names some. An id already read (a shared outcome a
 * template copied into a player's list) is read once.
 */
export function outcomesInPlay(
  state: Pick<StoryState, "sharedOutcomes" | "players">,
  seats: readonly PlayerSlot[] = Object.keys(state.players)
): OutcomeInPlay[] {
  const lists = [
    { owner: "shared", outcomes: state.sharedOutcomes ?? [] },
    ...seats.map((slot) => ({ owner: slot, outcomes: state.players[slot]?.outcomes ?? [] })),
  ];
  const seen = new Set<string>();
  return lists.flatMap(({ owner, outcomes }) =>
    outcomes.flatMap((outcome): OutcomeInPlay[] => {
      if (seen.has(outcome.id)) return [];
      seen.add(outcome.id);
      return [{ owner, outcome }];
    })
  );
}

/** Where an outcome stands with `added` milestones beyond those recorded: complete once that reaches its intended number (an aftermath beyond it too). */
export function outcomeState(owner: string, outcome: Outcome, added = 0): OutcomeState {
  const milestones = (outcome.milestones?.length ?? 0) + added;
  const intended = outcome.intendedNumberOfMilestones;
  return { id: outcome.id, owner, milestones, intended, complete: milestones >= intended };
}
