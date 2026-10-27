import type { ExtendedStoryMetadata } from "core/types/api";

/**
 * When a story was last played, from what the story feed carries.
 * - played: the latest seat time, whoever holds the seat. A seat's time moves
 *   when its player picks a character or a choice, when a turn is written for
 *   every seat, and when the seat is archived or left.
 * - never: no seat has a time and no turn has been written.
 * - unknown: a turn was written but no seat has a time, so when is not known.
 */
export type StoryLastPlayed =
  | { kind: "played"; at: number }
  | { kind: "never" }
  | { kind: "unknown" };

export function storyLastPlayed(
  story: Pick<ExtendedStoryMetadata, "players" | "currentBeat">
): StoryLastPlayed {
  const seatTimes = story.players
    .map((player) => player.lastPlayedAt)
    .filter((time): time is number => typeof time === "number");
  if (seatTimes.length > 0) {
    return { kind: "played", at: Math.max(...seatTimes) };
  }
  return (story.currentBeat ?? 0) > 0 ? { kind: "unknown" } : { kind: "never" };
}
