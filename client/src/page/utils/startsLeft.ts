import type { StartsLeftInfo } from "core/types/api";

/*
 * The signed-in account's story starts left (GET /stories/starts-left), as
 * "Start several stories at once" shows them before Start is pressed: how
 * many more stories can start, and when the allowance renews.
 */

/** The starts left, with their renewal on this device's clock. */
export interface StartsLeft {
  remaining: number;
  limit: number;
  windowMs: number;
  /** When the whole allowance is back (ms since the epoch); null while nothing is counted. */
  renewsAt: number | null;
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const NO_BREAK_SPACE = String.fromCharCode(0xa0);

/**
 * The server's answer, received at `receivedAt`. The renewal is placed from
 * the time left rather than the server's clock, so a device whose clock is off
 * still names the right minute.
 */
export function startsLeftFrom(info: StartsLeftInfo, receivedAt: number): StartsLeft {
  return {
    remaining: info.remaining,
    limit: info.limit,
    windowMs: info.windowMs,
    renewsAt: info.resetsInMs === null ? null : receivedAt + info.resetsInMs,
  };
}

/** The starts left at `now`: once the allowance has renewed, all of it. */
export function startsLeftAt(startsLeft: StartsLeft, now: number): StartsLeft {
  if (startsLeft.renewsAt === null || now < startsLeft.renewsAt) return startsLeft;
  return { ...startsLeft, remaining: startsLeft.limit, renewsAt: null };
}

/**
 * The renewal's time of day, rounded up to the minute so it never names one
 * too early, with no-break spaces so "2:30 PM" stays on one line.
 */
export function formatRenewalTime(time: number): string {
  return new Date(Math.ceil(time / MINUTE) * MINUTE)
    .toLocaleTimeString(undefined, { timeStyle: "short" })
    .replace(/\s/g, NO_BREAK_SPACE);
}

const storyWord = (count: number) => (count === 1 ? "story" : "stories");

/** "this hour" for an hourly allowance; the start limit could count over another length. */
const period = (windowMs: number) => (windowMs === HOUR ? "this hour" : "for now");

/** The panel's line: how many more stories can start, and when the allowance renews. */
export function startsLeftMessage(
  { remaining, limit, windowMs, renewsAt }: StartsLeft,
  formatTime: (time: number) => string = formatRenewalTime
): string {
  if (renewsAt === null) {
    return `You can start up to ${limit} ${storyWord(limit)} ${period(windowMs)}.`;
  }
  const again = `up to ${limit} again from ${formatTime(renewsAt)}`;
  if (remaining === 0) {
    return `You can't start more stories ${period(windowMs)}. You can start ${again}.`;
  }
  return `You can start ${remaining} more ${storyWord(remaining)} ${period(windowMs)}, and ${again}.`;
}

/**
 * The note next to Start when fewer stories can start than the `count`
 * chosen, or null when all of them can (or the starts left aren't known).
 */
export function startShortfallMessage(
  count: number,
  startsLeft: StartsLeft | null,
  formatTime: (time: number) => string = formatRenewalTime
): string | null {
  if (!startsLeft || count <= startsLeft.remaining) return null;
  const { remaining, renewsAt } = startsLeft;
  const when = renewsAt === null ? null : formatTime(renewsAt);
  if (remaining === 0) {
    return when ? `No stories can start now; try again from ${when}.` : "No stories can start now.";
  }
  return when
    ? `Only ${remaining} can start now; the rest from ${when}.`
    : `Only ${remaining} can start now.`;
}
