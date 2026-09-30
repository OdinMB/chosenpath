import type { ClientStoryState, GameErrorNotification } from "core/types";
import {
  failureOnScreen,
  NO_FAILURE,
  stillFailed,
  tryAgainRequest,
  turnFailureFrom,
  type FailureOnScreen,
} from "../../../src/game/turnFailure";
import { beat, clientStoryState, player } from "../../helpers/storyFixtures";

/*
 * When a turn fails for good, the server tells every player in the game
 * "Unable to continue the story. Please try again." (a player's own failed
 * choice or character selection reaches that player with its own line). The
 * game screen shows that line where it was waiting, with "Try again", until
 * the story moves on.
 */

const TURN_FAILED = "Unable to continue the story. Please try again.";

function serverError(operationType: string, error = TURN_FAILED): GameErrorNotification {
  return { type: "game_error_notification", gameId: "unknown", error, operationType };
}

/** The player's story at a turn: the beats so far, the last one's choice as given (-1: not chosen). */
function atTurn(choices: number[], overrides: Partial<ClientStoryState> = {}): ClientStoryState {
  return clientStoryState({
    players: { player1: player(choices.map((choice, i) => beat(`Beat ${i + 1}`, choice))) },
    ...overrides,
  });
}

describe("turnFailureFrom: which server errors are a failed turn", () => {
  it("takes a turn that failed for good, with the server's line", () => {
    expect(turnFailureFrom(serverError("moveStoryForward"), atTurn([1, 0]))).toEqual(
      expect.objectContaining({ message: TURN_FAILED })
    );
  });

  it.each([
    ["recordChoice", "Unable to process your choice. Please try again."],
    ["make_choice", "Unable to process your choice. Please try again."],
    ["recordCharacterSelection", "Unable to save your character choice. Please try again."],
    ["select_character", "Unable to save your character choice. Please try again."],
    ["retry_turn", TURN_FAILED],
  ])("takes a failed %s, which leaves the player waiting too", (operationType, line) => {
    expect(turnFailureFrom(serverError(operationType, line), atTurn([1, -1]))).toEqual(
      expect.objectContaining({ message: line })
    );
  });

  it("leaves other errors alone: a join code, a connection error, or the untyped copy of a response's error", () => {
    const state = atTurn([1, 0]);

    for (const operationType of ["verify_code", "unknown", "initializeStory"]) {
      expect(turnFailureFrom(serverError(operationType, "Invalid code"), state)).toBeNull();
    }
  });

  it("leaves it to the page when no story is on screen", () => {
    expect(turnFailureFrom(serverError("moveStoryForward"), null)).toBeNull();
  });
});

describe("stillFailed: the notice stays until the story moves on", () => {
  it("stays while the story is as it was, an image outcome arriving included", () => {
    const state = atTurn([1, 0]);
    const failure = turnFailureFrom(serverError("moveStoryForward"), state)!;

    expect(stillFailed(failure, state)).toBe(true);
    expect(stillFailed(failure, { ...state, failedImageIds: ["beat-1"] })).toBe(true);
  });

  it("goes when the next turn arrives (another player tried again, and it worked)", () => {
    const failure = turnFailureFrom(serverError("moveStoryForward"), atTurn([1, 0]))!;

    expect(stillFailed(failure, atTurn([1, 0, -1]))).toBe(false);
  });

  it("goes when the player's failed choice is stored after all", () => {
    const failure = turnFailureFrom(serverError("make_choice"), atTurn([1, -1]))!;

    expect(stillFailed(failure, atTurn([1, 2]))).toBe(false);
  });

  it("goes when the player's character is stored, or everyone's selection completes", () => {
    const picking = clientStoryState({ characterSelectionCompleted: false, players: { player1: player([], -1) } });
    const failure = turnFailureFrom(serverError("select_character"), picking)!;

    expect(stillFailed(failure, { ...picking, players: { player1: player([], 0) } })).toBe(false);
    expect(stillFailed(failure, { ...picking, characterSelectionCompleted: true })).toBe(false);
  });
});

describe("tryAgainRequest: what 'Try again' sends", () => {
  it("asks the server to write the turn again once the player's choice is in", () => {
    expect(tryAgainRequest(atTurn([1, 0]), { choice: { optionIndex: 0, beatCount: 2 } })).toEqual({ type: "retry_turn" });
  });

  it("asks for the first turn again once the characters are picked", () => {
    expect(tryAgainRequest(atTurn([]), {})).toEqual({ type: "retry_turn" });
  });

  it("sends the player's own choice again when it was never stored", () => {
    expect(tryAgainRequest(atTurn([1, -1]), { choice: { optionIndex: 2, beatCount: 2 } })).toEqual({
      type: "make_choice",
      optionIndex: 2,
    });
  });

  it("never sends a choice made on an earlier beat: the server then sends the story as stored, options open", () => {
    expect(tryAgainRequest(atTurn([1, 0, -1]), { choice: { optionIndex: 2, beatCount: 2 } })).toEqual({ type: "retry_turn" });
    expect(tryAgainRequest(atTurn([1, -1]), {})).toEqual({ type: "retry_turn" });
  });

  it("sends the player's character selection again while the selection is open", () => {
    const picking = clientStoryState({ characterSelectionCompleted: false, players: { player1: player([], -1) } });

    expect(tryAgainRequest(picking, { character: { identityIndex: 1, backgroundIndex: 2 } })).toEqual({
      type: "select_character",
      identityIndex: 1,
      backgroundIndex: 2,
    });
    expect(tryAgainRequest(picking, {})).toEqual({ type: "retry_turn" });
  });
});

/*
 * The notice goes whenever the player sends something that answers it:
 * "Try again", or their own choice or character sent again through the
 * game's own controls. Left up beside a send on its way, its "Try again"
 * would send the same choice or selection a second time.
 */
describe("failureOnScreen: when the notice shows", () => {
  const choiceFailed = turnFailureFrom(
    serverError("recordChoice", "Unable to process your choice. Please try again."),
    atTurn([1, -1])
  )!;
  const shown: FailureOnScreen = failureOnScreen(NO_FAILURE, { type: "failed", failure: choiceFailed });

  it("shows a failure as it arrives", () => {
    expect(shown.shown).toBe(choiceFailed);
  });

  it("hides it once the player sends again (Try again, or their own choice or character through the game's controls)", () => {
    expect(failureOnScreen(shown, { type: "sent" }).shown).toBeNull();
  });

  it("brings it back when that send is rate limited: the failure still stands", () => {
    const sent = failureOnScreen(shown, { type: "sent" });

    expect(failureOnScreen(sent, { type: "rateLimited" }).shown).toBe(choiceFailed);
  });

  it("keeps it hidden once a state arrives after the send, and a later rate limit brings nothing back", () => {
    const sent = failureOnScreen(shown, { type: "sent" });
    const arrived = failureOnScreen(sent, { type: "stateArrived", state: atTurn([1, -1]) });

    expect(arrived.shown).toBeNull();
    expect(failureOnScreen(arrived, { type: "rateLimited" }).shown).toBeNull();
  });

  it("keeps a failure shown through states that leave the story where it failed, and drops it once the story moves on", () => {
    expect(failureOnScreen(shown, { type: "stateArrived", state: atTurn([1, -1]) }).shown).toBe(choiceFailed);
    expect(failureOnScreen(shown, { type: "stateArrived", state: atTurn([1, 2]) }).shown).toBeNull();
  });

  it("shows a new failure after a send, and forgets everything when the player leaves the story", () => {
    const again = turnFailureFrom(serverError("moveStoryForward"), atTurn([1, 2]))!;
    const sent = failureOnScreen(shown, { type: "sent" });

    expect(failureOnScreen(sent, { type: "failed", failure: again })).toEqual({ shown: again, setAside: null });
    expect(failureOnScreen(shown, { type: "exited" })).toEqual(NO_FAILURE);
  });

  it("changes nothing when the player sends with no failure on screen", () => {
    expect(failureOnScreen(NO_FAILURE, { type: "sent" })).toBe(NO_FAILURE);
  });
});
