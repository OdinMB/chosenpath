import type { ExtendedStoryMetadata } from "core/types/api";
import { generateJoinLink } from "shared/utils/codeSetUtils";

/*
 * The printable seat cards of a class: one card per student, cut out and
 * handed round. A group is one story; its number follows the order in which
 * the stories were started, so the first group started is Group 1.
 */

export interface SeatCardData {
  storyId: string;
  storyTitle: string;
  groupNumber: number;
  code: string;
  joinLink: string;
}

/** player1, player2, …, player10 in seat order, not string order. */
function seatOrder(slot: string): number {
  const match = /(\d+)$/.exec(slot);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

/**
 * The cards of the selected stories: groups numbered 1..n oldest first, among
 * the selected ones only, and one card per seat that has a code.
 */
export function seatCardsFor(
  stories: ExtendedStoryMetadata[],
  selectedIds: ReadonlySet<string>
): SeatCardData[] {
  return stories
    .filter((story) => selectedIds.has(story.id))
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
    .flatMap((story, index) =>
      [...story.players]
        .sort((a, b) => seatOrder(a.playerSlot) - seatOrder(b.playerSlot))
        .flatMap((player) =>
          player.code
            ? [
                {
                  storyId: story.id,
                  storyTitle: story.title,
                  groupNumber: index + 1,
                  code: player.code,
                  joinLink: generateJoinLink(player.code),
                },
              ]
            : []
        )
    );
}
