import type { RateLimitedAction } from "core/config.js";
import type { StoryOrigin } from "server/stories/storyOrigins.js";
import { accountKey, addressKey, seatKey } from "shared/rateLimiter.js";

/*
 * Who is counted for what (the owner's decisions of 2026-10-26, classroom
 * access step 1): anonymous use is counted per address as before, so it is
 * no easier to abuse; a signed-in teacher's starts count against the account,
 * and choices in a story an account started count per seat, so a class behind
 * one school address isn't one bucket. The counting itself is rateLimiter.ts.
 */

export type LimitTarget = { key: string; action: RateLimitedAction };

/** The key and allowance a story start counts against. */
export function storyStartLimit(
  userId: string | undefined,
  generateImages: boolean,
  address: string | null
): LimitTarget {
  if (!userId) {
    return { key: addressKey(address), action: "initialize_story" };
  }
  return {
    key: accountKey(userId),
    action: generateImages ? "initialize_story_images" : "initialize_story_text",
  };
}

/**
 * The key a choice, character pick or turn retry counts against: the seat in
 * a story an account started, otherwise (anonymous story, no seat, origin
 * unknown) the address, the stricter side.
 */
export function choiceLimitKey(
  origin: StoryOrigin | undefined,
  seat: { storyId: string; playerSlot: string } | undefined,
  address: string | null
): string {
  if (seat && origin === "account") {
    return seatKey(seat.storyId, seat.playerSlot);
  }
  return addressKey(address);
}
