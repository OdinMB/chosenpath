import type { GameErrorNotification, RateLimitInfo } from "core/types";

/*
 * The game page when it can't open the story it was sent to (StoryLoadFailed),
 * shown instead of the spinner. The server answers a code check that finds no
 * story it can open with one line, whether the code names no story or its
 * story can't be loaded, so that refusal names no cause. A page that hears
 * nothing in time says so too, and a code check turned away by the address's
 * limit says how long to wait.
 */

/**
 * The server's line when a code check finds no story it can open.
 * NOTE: This must match the verify_code handler in server/src/game/websocket.ts;
 * any other line reads as a server failure, which blames no one's code.
 */
export const CODE_REFUSED = "Invalid code";

/** How long the game page waits for its story before it says it couldn't open it */
export const STORY_LOAD_TIMEOUT_MS = 20_000;

/** Why the game page couldn't open its story */
export type StoryLoadFailure =
  /** The code check found no story it could open: a code that names none, or a story that can't be loaded */
  | { kind: "refused" }
  /** The code check itself failed */
  | { kind: "unavailable" }
  /** Nothing answered in time */
  | { kind: "noAnswer" }
  /** The address checked too many codes that named no story */
  | { kind: "rateLimited"; timeRemaining: number };

/** What the page tells the player */
export interface LoadFailureNotice {
  title: string;
  message: string;
}

const CODE_CHECK = "verify_code";

/** The failure a server error reports, or null when it is not the code check's or a story is on screen. */
export function loadFailureFrom(
  error: GameErrorNotification,
  storyOnScreen: boolean
): StoryLoadFailure | null {
  if (storyOnScreen || error.operationType !== CODE_CHECK) return null;
  return error.error === CODE_REFUSED
    ? { kind: "refused" }
    : { kind: "unavailable" };
}

/** The failure a rate limit reports, or null when it is not the code check's or a story is on screen. */
export function loadFailureFromLimit(
  operationType: string,
  rateLimit: RateLimitInfo,
  storyOnScreen: boolean
): StoryLoadFailure | null {
  if (storyOnScreen || operationType !== CODE_CHECK) return null;
  return { kind: "rateLimited", timeRemaining: rateLimit.timeRemaining };
}

/**
 * Whether the page still asks for its story: while nothing has failed, and
 * after nothing answered in time, since an answer that comes late still opens
 * it. Once the server has answered no, asking again would only be refused again.
 */
export function waitsForStory(failure: StoryLoadFailure | null): boolean {
  return failure === null || failure.kind === "noAnswer";
}

const COULD_NOT_OPEN = "We couldn't open this story";

function waitFor(timeRemaining: number): string {
  const minutes = Math.ceil(timeRemaining / 60_000);
  return minutes <= 1 ? "about a minute" : `${minutes} minutes`;
}

/** What the player is told about a failure, in their terms. */
export function describeLoadFailure(
  failure: StoryLoadFailure
): LoadFailureNotice {
  switch (failure.kind) {
    case "refused":
      return {
        title: COULD_NOT_OPEN,
        message:
          "Check that the code matches the one you were given. If it does, try again in a moment.",
      };
    case "unavailable":
      return {
        title: COULD_NOT_OPEN,
        message:
          "Something went wrong on our side while loading it. Please try again in a moment.",
      };
    case "noAnswer":
      return {
        title: COULD_NOT_OPEN,
        message: "The game didn't answer in time. Try again in a moment.",
      };
    case "rateLimited":
      return {
        title: "Too many tries just now",
        message: `This network has tried a lot of story codes in a short time. Wait ${waitFor(
          failure.timeRemaining
        )}, then try again.`,
      };
  }
}
