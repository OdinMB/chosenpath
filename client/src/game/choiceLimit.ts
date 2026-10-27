import type { ClientStoryState, RateLimitInfo } from "core/types";
import { progressOf } from "./turnFailure";

/*
 * A choice the server refused because the player chose faster than the game
 * allows (the make_choice rate limit, which a character pick and "Try again"
 * count against too, so all of them are refused with a make_choice
 * response). The game screen says so below the choices, which are open
 * again, and counts down to when the player can choose again
 * (ChoiceLimitNotice). The notice goes when the player sends a choice again,
 * and comes back if that one is refused too.
 */

export interface ChoiceLimit {
  /** When the player can choose again (ms, the client's clock) */
  until: number;
  /** Where the story stood when the choice was refused (progressOf): the notice goes once it moves on */
  at: string;
}

export type ChoiceLimitEvent =
  | {
      type: "limited";
      /** The type of the refused request's response */
      response: string;
      rateLimit: RateLimitInfo;
      state: ClientStoryState | null;
      now: number;
    }
  | { type: "sent" }
  | { type: "stateArrived"; state: ClientStoryState }
  | { type: "exited" };

/** What the server answers a refused choice, character pick or "Try again" with */
const CHOICE_REFUSED = "make_choice_response";

/** The provider's reducer for the refused choice on screen (ChoiceLimit). */
export function choiceLimitOn(
  current: ChoiceLimit | null,
  event: ChoiceLimitEvent
): ChoiceLimit | null {
  switch (event.type) {
    case "limited":
      if (event.response !== CHOICE_REFUSED || !event.state) return current;
      return {
        until: event.now + Math.max(0, event.rateLimit.timeRemaining),
        at: progressOf(event.state),
      };
    case "sent":
    case "exited":
      return null;
    case "stateArrived":
      return current && progressOf(event.state) === current.at
        ? current
        : null;
  }
}

/** Whole seconds until the player can choose again, rounded up so it never says "now" early. */
export function secondsUntilChoice(until: number, now: number): number {
  return Math.max(0, Math.ceil((until - now) / 1000));
}

/** When the player can choose again, in plain words. */
export function chooseAgainLine(secondsLeft: number): string {
  if (secondsLeft <= 0) return "You can choose again now.";
  return `You can choose again in ${secondsLeft} ${
    secondsLeft === 1 ? "second" : "seconds"
  }.`;
}
