import type { Outcome } from "../types/outcome.js";
import type { PlayerCount } from "../types/player.js";
import type { StoryState } from "../types/story.js";
import { getPlayerSlots } from "./playerUtils.js";

/*
 * Whether a story has the outcomes it needs to start. A story plays toward
 * its outcomes: with none, every plan invents outcome ids. A multiplayer
 * story's first thread groups every player on a shared outcome, so it needs
 * one. The server refuses such a template story, retries such a generated
 * setup once, and the template editor flags the template.
 *
 * The problems are phrased to follow a colon ("... won't start: <problem>.").
 */

export const NO_OUTCOMES_PROBLEM = "there are no outcomes for the story to resolve";
export const NO_SHARED_OUTCOME_PROBLEM =
  "a story with more than one player needs a shared outcome, and there is none";

type OutcomeList = readonly Outcome[] | null | undefined;

export type StoryStartOutcomes = {
  sharedOutcomes: OutcomeList;
  /** The outcomes of each seat in play */
  seatOutcomes: readonly OutcomeList[];
  playerCount: number;
};

/** A template or a setup reply: its shared outcomes and each seat's options under the seat's slot. */
export type SeatedOutcomes = { sharedOutcomes?: OutcomeList } & {
  [slot: `player${number}`]: { outcomes?: OutcomeList } | undefined;
};

const holdsOutcome = (list: OutcomeList): boolean => (list?.length ?? 0) > 0;

/** Whether players compete over this outcome: its resolutions are side A wins, mixed, side B wins. */
export function isContestedOutcome(outcome: Outcome): boolean {
  const resolutions: unknown = outcome.possibleResolutions;
  return typeof resolutions === "object" && resolutions !== null && "sideAWins" in resolutions;
}

/** Why a story with these outcomes can't start, or null when it can. */
export function storyStartProblem({
  sharedOutcomes,
  seatOutcomes,
  playerCount,
}: StoryStartOutcomes): string | null {
  if (!holdsOutcome(sharedOutcomes) && !seatOutcomes.some(holdsOutcome)) {
    return NO_OUTCOMES_PROBLEM;
  }
  if (playerCount > 1 && !holdsOutcome(sharedOutcomes)) {
    return NO_SHARED_OUTCOME_PROBLEM;
  }
  return null;
}

/** The start rule for a story of `playerCount` players from a template or setup reply: only the seats in play count. */
export function templateStartProblem(
  template: SeatedOutcomes,
  playerCount: PlayerCount
): string | null {
  return storyStartProblem({
    sharedOutcomes: template.sharedOutcomes,
    seatOutcomes: getPlayerSlots(playerCount).map(
      (slot) => template[slot as `player${number}`]?.outcomes
    ),
    playerCount,
  });
}

/** The start rule for a created story state: its shared outcomes and its players' outcomes. */
export function storyStateStartProblem(
  state: Pick<StoryState, "sharedOutcomes" | "players">,
  playerCount: PlayerCount
): string | null {
  return storyStartProblem({
    sharedOutcomes: state.sharedOutcomes,
    seatOutcomes: getPlayerSlots(playerCount).map(
      (slot) => state.players[slot]?.outcomes
    ),
    playerCount,
  });
}
