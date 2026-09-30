import type { ClientStoryState, GameErrorNotification } from "core/types";

/*
 * A turn that failed for good, as the game screen shows it (TurnFailedNotice).
 * The server tells every player in the game "Unable to continue the story.
 * Please try again." when a turn fails after its one resend, and a player
 * whose own choice or character selection failed gets that failure's line.
 * The notice stands where the game was waiting until the story moves on or
 * the player tries again.
 */

export interface TurnFailure {
  /** The server's line, shown as it is */
  message: string;
  /** Where the story stood when it failed (progressOf): the notice goes once it moves on */
  at: string;
}

/** What the player last sent, so that "Try again" can send it once more */
export interface LastSent {
  choice?: { optionIndex: number; beatCount: number };
  character?: { identityIndex: number; backgroundIndex: number };
}

/** What "Try again" sends: the player's own choice or selection if it never arrived, else a request to write the turn again */
export type TryAgainRequest =
  | { type: "make_choice"; optionIndex: number }
  | { type: "select_character"; identityIndex: number; backgroundIndex: number }
  | { type: "retry_turn" };

/**
 * The operations whose failure leaves the player waiting: the turn itself
 * (as the queue reports it, or a retry of it), and the player's own choice or
 * character selection (from the queue, or as the request's error response).
 * An error without its operation ("unknown") is the handler's copy of a
 * response error that follows with its operation, or a connection error.
 */
const TURN_OPERATIONS = new Set([
  "moveStoryForward",
  "retry_turn",
  "recordChoice",
  "make_choice",
  "recordCharacterSelection",
  "select_character",
]);

const TURN_FAILED_LINE = "Unable to continue the story. Please try again.";

function ownPlayer(state: ClientStoryState) {
  // A player's own state comes first in the state the server sends them
  const [slot] = Object.keys(state.players);
  return slot === undefined ? undefined : state.players[slot];
}

/** How many beats the player has: the turn a choice is made on. */
export function beatCountOf(state: ClientStoryState): number {
  return ownPlayer(state)?.beatHistory.length ?? 0;
}

/** What only a story that moved on changes: the player's character, their beats and their latest choice; images never. */
function progressOf(state: ClientStoryState): string {
  const player = ownPlayer(state);
  const beats = player?.beatHistory ?? [];
  return JSON.stringify([
    state.characterSelectionCompleted,
    player?.identityChoice ?? null,
    player?.backgroundChoice ?? null,
    beats.length,
    beats[beats.length - 1]?.choice ?? null,
  ]);
}

/** The failure a server error reports, or null when it is not one that leaves the player waiting (or no story is on screen). */
export function turnFailureFrom(
  error: GameErrorNotification,
  state: ClientStoryState | null
): TurnFailure | null {
  if (!state || !TURN_OPERATIONS.has(error.operationType)) return null;
  return { message: error.error || TURN_FAILED_LINE, at: progressOf(state) };
}

/** Whether a state that arrived leaves the story where it failed: a new turn, or the player's own choice or character stored, ends it. */
export function stillFailed(
  failure: TurnFailure,
  state: ClientStoryState
): boolean {
  return progressOf(state) === failure.at;
}

/**
 * The failure the game screen shows, and the one the player's last send set
 * aside. Any send that answers the failure hides it: "Try again", or the
 * player's own choice or character sent again through the game's controls.
 * Left up beside a send on its way, its "Try again" would send the same
 * choice or selection a second time. A send that is rate limited brings it
 * back, since the failure still stands; a state arriving settles it.
 */
export interface FailureOnScreen {
  shown: TurnFailure | null;
  setAside: TurnFailure | null;
}

export type FailureEvent =
  | { type: "failed"; failure: TurnFailure }
  | { type: "sent" }
  | { type: "rateLimited" }
  | { type: "stateArrived"; state: ClientStoryState }
  | { type: "exited" };

export const NO_FAILURE: FailureOnScreen = { shown: null, setAside: null };

/** The provider's reducer for the failure on screen (FailureOnScreen). */
export function failureOnScreen(
  current: FailureOnScreen,
  event: FailureEvent
): FailureOnScreen {
  switch (event.type) {
    case "failed":
      return { shown: event.failure, setAside: null };
    case "sent":
      return current.shown ? { shown: null, setAside: current.shown } : current;
    case "rateLimited":
      return current.setAside
        ? { shown: current.setAside, setAside: null }
        : current;
    case "stateArrived": {
      // A failure stands until the story moves on (another player's "Try again" included)
      const shown =
        current.shown && stillFailed(current.shown, event.state)
          ? current.shown
          : null;
      return shown === current.shown && current.setAside === null
        ? current
        : { shown, setAside: null };
    }
    case "exited":
      return NO_FAILURE;
  }
}

/**
 * What "Try again" sends, from what the story on screen is missing. While
 * the characters are picked: the player's selection again. When the player's
 * choice on this beat never got stored: that choice again. Otherwise the turn
 * itself is missing, and the server writes it again if nothing else is (or
 * sends the story as stored, which reopens whatever the player can do).
 */
export function tryAgainRequest(
  state: ClientStoryState,
  lastSent: LastSent
): TryAgainRequest {
  if (!state.characterSelectionCompleted) {
    return lastSent.character
      ? { type: "select_character", ...lastSent.character }
      : { type: "retry_turn" };
  }

  const beats = ownPlayer(state)?.beatHistory ?? [];
  const latest = beats[beats.length - 1];
  if (
    latest?.choice === -1 &&
    lastSent.choice &&
    lastSent.choice.beatCount === beats.length
  ) {
    return { type: "make_choice", optionIndex: lastSent.choice.optionIndex };
  }
  return { type: "retry_turn" };
}
