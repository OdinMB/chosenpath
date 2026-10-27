import type { ExtendedStoryMetadata } from "core/types/api";

/**
 * Whether the account started the story and holds none of its seats, as for
 * stories started for other players to play.
 */
function startedForOthersBy(
  story: ExtendedStoryMetadata,
  userId: string
): boolean {
  return (
    story.creatorId === userId &&
    !story.players.some((player) => player.userId === userId)
  );
}

/**
 * The seat codes a story card's "Link to my account" links to the signed-in
 * account: codes stored on this device for active seats not linked to it yet.
 * Seats started for other players to play are never among them: codes marked
 * so when they were stored, and, for codes stored before those marks existed,
 * every seat of a story the account started and holds no seat in.
 */
export function linkableCodes(
  story: ExtendedStoryMetadata,
  userId: string,
  storedCodes: readonly string[],
  codesStartedForOthers: readonly string[]
): string[] {
  if (startedForOthersBy(story, userId)) return [];
  return story.players.flatMap((player) =>
    player.code &&
    storedCodes.includes(player.code) &&
    !codesStartedForOthers.includes(player.code) &&
    player.userId !== userId &&
    player.status === "active"
      ? [player.code]
      : []
  );
}
