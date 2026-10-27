import type { ClientStoryState, RateLimitInfo } from "core/types";
import {
  choiceLimitOn,
  chooseAgainLine,
  secondsUntilChoice,
  type ChoiceLimit,
  type ChoiceLimitEvent,
} from "../../../src/game/choiceLimit";
import { beat, clientStoryState, player } from "../../helpers/storyFixtures";

/*
 * The server takes a few choices per seat every 30 seconds; a character pick
 * and "Try again" count as choices too, and all of them are refused with a
 * make_choice response. A refused choice used to bring the same options back
 * with nothing said; now the player is told it wasn't sent, and when they
 * can choose again, until they send a choice again.
 */

const NOW = 1_700_000_000_000;

/** The player's story at a turn: the beats so far, the last one's choice as given (-1: not chosen). */
function atTurn(choices: number[], others: ClientStoryState["players"] = {}): ClientStoryState {
  return clientStoryState({
    players: { player1: player(choices.map((choice, i) => beat(`Beat ${i + 1}`, choice))), ...others },
  });
}

function limitedFor(timeRemaining: number): RateLimitInfo {
  return { isLimited: true, timeRemaining, requestsRemaining: 0 };
}

/** The server's refusal of the player's choice, as it reaches the client at NOW. */
function refused(
  state: ClientStoryState | null,
  timeRemaining = 12_000,
  response = "make_choice_response"
): ChoiceLimitEvent {
  return { type: "limited", response, rateLimit: limitedFor(timeRemaining), state, now: NOW };
}

describe("choiceLimitOn: when the notice shows", () => {
  const open = atTurn([1, -1]);
  const shown = choiceLimitOn(null, refused(open)) as ChoiceLimit;

  it("shows when the player's choice is refused, until the time the server gives", () => {
    expect(shown).toEqual(expect.objectContaining({ until: NOW + 12_000 }));
  });

  it("ignores other refusals on the game's connection: a join code, or a reconnect counted as one", () => {
    expect(choiceLimitOn(null, refused(open, 12_000, "verify_code_response"))).toBeNull();
    expect(choiceLimitOn(shown, refused(open, 50_000, "verify_code_response"))).toBe(shown);
  });

  it("ignores a refusal with no story on screen", () => {
    expect(choiceLimitOn(null, refused(null))).toBeNull();
  });

  it("never counts back from before the refusal", () => {
    expect(choiceLimitOn(null, refused(open, -500))).toEqual(expect.objectContaining({ until: NOW }));
  });

  it("hides once the player sends a choice again, and a new refusal shows the new wait", () => {
    const sent = choiceLimitOn(shown, { type: "sent" });

    expect(sent).toBeNull();
    expect(choiceLimitOn(sent, refused(open, 4_000))).toEqual(expect.objectContaining({ until: NOW + 4_000 }));
  });

  it("stays through states that leave the player's choice open: another player's choice, an image arriving", () => {
    const otherChose = atTurn([1, -1], { player2: player([beat("Beat 1"), beat("Beat 2")]) });

    expect(choiceLimitOn(shown, { type: "stateArrived", state: otherChose })).toBe(shown);
    expect(choiceLimitOn(shown, { type: "stateArrived", state: { ...open, failedImageIds: ["beat-1"] } })).toBe(shown);
  });

  it("goes once the player's choice is stored, or the story moves on", () => {
    expect(choiceLimitOn(shown, { type: "stateArrived", state: atTurn([1, 2]) })).toBeNull();
    expect(choiceLimitOn(shown, { type: "stateArrived", state: atTurn([1, 2, -1]) })).toBeNull();
  });

  it("goes when the player leaves the story", () => {
    expect(choiceLimitOn(shown, { type: "exited" })).toBeNull();
  });
});

describe("secondsUntilChoice: the countdown", () => {
  const until = NOW + 12_000;

  it("counts whole seconds, rounding up, so it never says the player can choose before they can", () => {
    expect(secondsUntilChoice(until, NOW)).toBe(12);
    expect(secondsUntilChoice(until, NOW + 100)).toBe(12);
    expect(secondsUntilChoice(until, NOW + 1_000)).toBe(11);
    expect(secondsUntilChoice(until, NOW + 11_001)).toBe(1);
  });

  it("reaches 0 when the wait is over, and stays there", () => {
    expect(secondsUntilChoice(until, until)).toBe(0);
    expect(secondsUntilChoice(until, until + 60_000)).toBe(0);
  });
});

describe("chooseAgainLine: when the player can choose again", () => {
  it("counts down in seconds while the wait lasts", () => {
    expect(chooseAgainLine(12)).toBe("You can choose again in 12 seconds.");
    expect(chooseAgainLine(1)).toBe("You can choose again in 1 second.");
  });

  it("says so once the wait is over", () => {
    expect(chooseAgainLine(0)).toBe("You can choose again now.");
  });
});
