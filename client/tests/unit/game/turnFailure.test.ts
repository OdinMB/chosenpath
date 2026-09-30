import type { ClientStoryState, GameErrorNotification } from "core/types";
import {
  stillFailed,
  tryAgainRequest,
  turnFailureFrom,
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
