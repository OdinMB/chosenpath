import {
  formatRenewalTime,
  startShortfallMessage,
  startsLeftAt,
  startsLeftFrom,
  startsLeftMessage,
  type StartsLeft,
} from "../../../src/page/utils/startsLeft";
import { AUDIENCE_WORDS } from "../../helpers/genericWording";

/*
 * Before "Start several stories at once" starts anything, the panel says how
 * many stories the signed-in account can still start this hour and when that
 * allowance renews; next to Start it says when fewer can start than chosen.
 */

const HOUR = 60 * 60 * 1000;
const RENEWS_AT = 5_000_000;
/** A clock face for the tests: the renewal reads 14:20. */
const at = (time: number) => (time === RENEWS_AT ? "14:20" : `t${time}`);

const startsLeft = (remaining: number, renewsAt: number | null = RENEWS_AT): StartsLeft => ({
  remaining,
  limit: 15,
  windowMs: HOUR,
  renewsAt,
});

describe("startsLeftFrom", () => {
  it("places the renewal on this device's clock, from when the answer arrived", () => {
    expect(
      startsLeftFrom({ remaining: 7, limit: 15, windowMs: HOUR, resetsInMs: 20 * 60 * 1000 }, 1_000)
    ).toEqual({ remaining: 7, limit: 15, windowMs: HOUR, renewsAt: 1_000 + 20 * 60 * 1000 });
  });

  it("has nothing to renew while no start is counted", () => {
    expect(
      startsLeftFrom({ remaining: 15, limit: 15, windowMs: HOUR, resetsInMs: null }, 1_000).renewsAt
    ).toBeNull();
  });
});

describe("startsLeftAt", () => {
  it("keeps the count until the allowance renews", () => {
    expect(startsLeftAt(startsLeft(7), RENEWS_AT - 1)).toEqual(startsLeft(7));
  });

  it("gives the whole allowance back once it has renewed", () => {
    expect(startsLeftAt(startsLeft(0), RENEWS_AT)).toEqual(startsLeft(15, null));
  });
});

describe("formatRenewalTime", () => {
  const minute = 60 * 1000;
  const onTheMinute = Math.ceil(Date.UTC(2026, 9, 27, 13, 20) / minute) * minute;

  it("names the minute the allowance renews in, never one too early", () => {
    expect(formatRenewalTime(onTheMinute - 30 * 1000)).toBe(formatRenewalTime(onTheMinute));
    expect(formatRenewalTime(onTheMinute + 1)).toBe(formatRenewalTime(onTheMinute + minute));
    expect(formatRenewalTime(onTheMinute)).not.toBe(formatRenewalTime(onTheMinute + 1));
  });

  it("keeps the time on one line, as in 2:30 PM", () => {
    // No space a line may break at; a no-break space (narrow or not) is fine
    const noBreak = [0xa0, 0x202f].map((code) => String.fromCharCode(code));
    const breakable = [...formatRenewalTime(onTheMinute)].filter(
      (char) => /\s/.test(char) && !noBreak.includes(char)
    );

    expect(breakable).toEqual([]);
  });
});

describe("startsLeftMessage", () => {
  it("says how many more can start this hour, and when the allowance renews", () => {
    expect(startsLeftMessage(startsLeft(7), at)).toBe(
      "You can start 7 more stories this hour, and up to 15 again from 14:20."
    );
    expect(startsLeftMessage(startsLeft(1), at)).toBe(
      "You can start 1 more story this hour, and up to 15 again from 14:20."
    );
  });

  it("says the whole allowance while nothing has started", () => {
    expect(startsLeftMessage(startsLeft(15, null), at)).toBe(
      "You can start up to 15 stories this hour."
    );
  });

  it("says plainly when none can start, and from when they can", () => {
    expect(startsLeftMessage(startsLeft(0), at)).toBe(
      "You can't start more stories this hour. You can start up to 15 again from 14:20."
    );
  });

  it("claims no hour for an allowance counted over another length of time", () => {
    const halfHour = { ...startsLeft(3), windowMs: HOUR / 2 };

    expect(startsLeftMessage(halfHour, at)).toBe(
      "You can start 3 more stories for now, and up to 15 again from 14:20."
    );
  });
});

describe("startShortfallMessage", () => {
  it("says nothing while every chosen story can start, or the count isn't known", () => {
    expect(startShortfallMessage(7, startsLeft(7), at)).toBeNull();
    expect(startShortfallMessage(4, startsLeft(15, null), at)).toBeNull();
    expect(startShortfallMessage(12, null, at)).toBeNull();
  });

  it("says how many can start now and when the rest can", () => {
    expect(startShortfallMessage(8, startsLeft(7), at)).toBe(
      "Only 7 can start now; the rest from 14:20."
    );
    expect(startShortfallMessage(2, startsLeft(1), at)).toBe(
      "Only 1 can start now; the rest from 14:20."
    );
  });

  it("says when none can start, and from when", () => {
    expect(startShortfallMessage(2, startsLeft(0), at)).toBe(
      "No stories can start now; try again from 14:20."
    );
  });
});

describe("starts-left wording", () => {
  it("names no audience or group", () => {
    const messages = [
      ...[0, 1, 7].map((remaining) => startsLeftMessage(startsLeft(remaining), at)),
      startsLeftMessage(startsLeft(15, null), at),
      ...[0, 1, 7].map((remaining) => startShortfallMessage(12, startsLeft(remaining), at)),
    ];

    for (const message of messages) expect(message).not.toMatch(AUDIENCE_WORDS);
  });
});
