import type { ExtendedStoryMetadata } from "core/types/api";
import { generateJoinLink } from "shared/utils/codeSetUtils";

/*
 * The printable seat cards of the stories someone started: one card per seat,
 * cut out and handed round. Stories are numbered in the order they were
 * started, so the first one started is Story 1; seats are numbered within
 * their story among the cards it gets.
 */

export interface SeatCardData {
  storyId: string;
  storyTitle: string;
  storyNumber: number;
  /** The seat's place among its story's cards, from 1. */
  seatNumber: number;
  /** How many cards its story has; a story with one seat names no seat. */
  seatCount: number;
  code: string;
  joinLink: string;
}

/** player1, player2, …, player10 in seat order, not string order. */
function seatOrder(slot: string): number {
  const match = /(\d+)$/.exec(slot);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

/** A story's seat codes in seat order, leaving out seats without a code. */
function seatCodes(story: ExtendedStoryMetadata): string[] {
  return [...story.players]
    .sort((a, b) => seatOrder(a.playerSlot) - seatOrder(b.playerSlot))
    .flatMap((player) => (player.code ? [player.code] : []));
}

/**
 * The cards of the selected stories: stories numbered 1..n oldest first,
 * among the selected ones only, and one card per seat that has a code.
 */
export function seatCardsFor(
  stories: ExtendedStoryMetadata[],
  selectedIds: ReadonlySet<string>
): SeatCardData[] {
  return stories
    .filter((story) => selectedIds.has(story.id))
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
    .flatMap((story, index) => {
      const codes = seatCodes(story);
      return codes.map((code, seatIndex) => ({
        storyId: story.id,
        storyTitle: story.title,
        storyNumber: index + 1,
        seatNumber: seatIndex + 1,
        seatCount: codes.length,
        code,
        joinLink: generateJoinLink(code),
      }));
    });
}
