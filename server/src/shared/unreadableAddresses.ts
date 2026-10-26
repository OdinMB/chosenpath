import type { UnreadableAddressCounts } from "core/types/api.js";
import { Logger } from "shared/logger.js";

/*
 * How many of the address reads the limits make found no client address,
 * since the process started and in the last hour. All such requests share one
 * limit bucket, so a TRUST_PROXY set higher than the real proxy chain shows up
 * here as nearly every request: /admin/system shows the counts beside the
 * verdict, and the log warns again at most every ten minutes while it lasts.
 * Counts only: no address, header or request is kept or logged.
 */

const log = Logger.forService("ClientAddress");

const MINUTE_MS = 60 * 1000;
const RECENT_MINUTES = 60;
const WARN_EVERY_MS = 10 * MINUTE_MS;

type Tally = { unreadable: number; total: number };

let startedAt = Date.now();
let sinceStart: Tally = { unreadable: 0, total: 0 };
// Per minute (its start, in ms), for the last hour
let perMinute = new Map<number, Tally>();
let lastWarnedAt: number | null = null;

function dropOldMinutes(now: number): void {
  const oldest = now - RECENT_MINUTES * MINUTE_MS;
  for (const minute of perMinute.keys()) {
    if (minute + MINUTE_MS <= oldest) perMinute.delete(minute);
  }
}

function lastHour(now: number): Tally {
  dropOldMinutes(now);
  const tally: Tally = { unreadable: 0, total: 0 };
  for (const minute of perMinute.values()) {
    tally.unreadable += minute.unreadable;
    tally.total += minute.total;
  }
  return tally;
}

function warnIfDue(now: number): void {
  if (lastWarnedAt !== null && now - lastWarnedAt < WARN_EVERY_MS) return;
  lastWarnedAt = now;
  const hour = lastHour(now);
  log.warn(
    `${hour.unreadable} of ${hour.total} address reads in the last hour found no client address ` +
      "(no X-Forwarded-For, a chain shorter than TRUST_PROXY, or no address at that position); " +
      "those requests share one limit bucket. Check the count on /admin/system."
  );
}

/** Counts one address read for a limit; an unreadable one may log the periodic warning. */
export function noteAddressRead(
  address: string | null,
  now: number = Date.now()
): string | null {
  const unreadable = address === null ? 1 : 0;
  sinceStart.total += 1;
  sinceStart.unreadable += unreadable;
  const minute = now - (now % MINUTE_MS);
  // A new minute drops those past the hour, so the tallies stay at most 61
  if (!perMinute.has(minute)) dropOldMinutes(now);
  const tally = perMinute.get(minute) ?? { unreadable: 0, total: 0 };
  tally.total += 1;
  tally.unreadable += unreadable;
  perMinute.set(minute, tally);
  if (unreadable) warnIfDue(now);
  return address;
}

/** The counts for /admin/system. */
export function unreadableAddressCounts(
  now: number = Date.now()
): UnreadableAddressCounts {
  return {
    sinceStart: { ...sinceStart, since: startedAt },
    lastHour: lastHour(now),
  };
}

/** Back to a fresh process's state; for tests. */
export function resetUnreadableAddressCounts(now: number = Date.now()): void {
  startedAt = now;
  sinceStart = { unreadable: 0, total: 0 };
  perMinute = new Map();
  lastWarnedAt = null;
}
