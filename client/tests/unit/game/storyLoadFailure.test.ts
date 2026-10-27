import type { GameErrorNotification, RateLimitInfo } from "core/types";
import {
  CODE_REFUSED,
  describeLoadFailure,
  loadFailureFrom,
  loadFailureFromLimit,
  waitsForStory,
  type StoryLoadFailure,
} from "../../../src/game/storyLoadFailure";

/*
 * The game page when it can't open the story it was sent to: the code check
 * refused, the server failed, nothing answered in time, or the address is
 * rate limited. It says so in the player's terms instead of the spinner.
 */

function serverError(error: string, operationType = "verify_code"): GameErrorNotification {
  return { type: "game_error_notification", gameId: "unknown", error, operationType };
}

function limit(timeRemaining: number): RateLimitInfo {
  return { isLimited: true, timeRemaining, requestsRemaining: 0 };
}

describe("loadFailureFrom: a server error while no story is on screen", () => {
  it("is a refusal when the code check found no story it could open", () => {
    expect(loadFailureFrom(serverError(CODE_REFUSED), false)).toEqual({ kind: "refused" });
  });

  it("is a story that couldn't be opened when the code check itself failed", () => {
    expect(loadFailureFrom(serverError("Failed to verify code"), false)).toEqual({
      kind: "unavailable",
    });
  });

  it("is nothing once a story is on screen: the game shows its own failures", () => {
    expect(loadFailureFrom(serverError(CODE_REFUSED), true)).toBeNull();
  });

  it("is nothing for an operation other than the code check", () => {
    for (const operationType of ["make_choice", "unknown", "create_session"]) {
      expect(loadFailureFrom(serverError("Something failed", operationType), false)).toBeNull();
    }
  });
});

describe("loadFailureFromLimit: a rate limit while no story is on screen", () => {
  it("is a limit, with how long is left, when the code check was turned away", () => {
    expect(loadFailureFromLimit("verify_code", limit(42_000), false)).toEqual({
      kind: "rateLimited",
      timeRemaining: 42_000,
    });
  });

  it("is nothing once a story is on screen", () => {
    expect(loadFailureFromLimit("verify_code", limit(42_000), true)).toBeNull();
  });

  it("is nothing for another operation's limit", () => {
    expect(loadFailureFromLimit("make_choice", limit(42_000), false)).toBeNull();
  });
});

describe("waitsForStory: whether the page still asks for its story", () => {
  it("waits while nothing has failed", () => {
    expect(waitsForStory(null)).toBe(true);
  });

  it("keeps waiting after no answer came in time: an answer that comes late still opens the story", () => {
    expect(waitsForStory({ kind: "noAnswer" })).toBe(true);
  });

  it("stops asking once the server answered no, so a refusal is not sent again and again", () => {
    const answered: StoryLoadFailure[] = [
      { kind: "refused" },
      { kind: "unavailable" },
      { kind: "rateLimited", timeRemaining: 1000 },
    ];
    for (const failure of answered) {
      expect(waitsForStory(failure)).toBe(false);
    }
  });
});

describe("describeLoadFailure: what the player is told", () => {
  const refused = describeLoadFailure({ kind: "refused" });
  const unavailable = describeLoadFailure({ kind: "unavailable" });
  const noAnswer = describeLoadFailure({ kind: "noAnswer" });
  const rateLimited = describeLoadFailure({ kind: "rateLimited", timeRemaining: 30_000 });

  it("says the story couldn't be opened, whatever kept it shut", () => {
    for (const notice of [refused, unavailable, noAnswer]) {
      expect(notice.title).toBe("We couldn't open this story");
    }
  });

  it("names no cause for a refusal, since it may be the code or the server: the code is only for checking", () => {
    expect(refused.message).toMatch(/code/i);
    expect(refused.message).not.toMatch(/our side|doesn't match|wrong|invalid/i);
  });

  it("points at the code only for a refusal, and at no one's connection when nothing answers", () => {
    for (const notice of [unavailable, noAnswer]) {
      expect(notice.message).not.toMatch(/code/i);
    }
    expect(noAnswer.message).not.toMatch(/connection/i);
  });

  it("tells each of the three apart", () => {
    expect(new Set([refused.message, unavailable.message, noAnswer.message]).size).toBe(3);
  });

  it("keeps a rate limit distinct, with how long to wait", () => {
    expect(rateLimited.title).not.toBe(refused.title);
    expect(rateLimited.message).toContain("about a minute");
  });

  it("rounds a longer wait up to whole minutes", () => {
    const longer = describeLoadFailure({ kind: "rateLimited", timeRemaining: 150_000 });
    expect(longer.message).toContain("3 minutes");
  });
});
