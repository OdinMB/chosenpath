import type { Request } from "express";
import { RateLimitedAction, RATE_LIMITS } from "core/config.js";
import { RateLimitInfo } from "core/types/api.js";
import { Logger } from "shared/logger.js";
import { ipv6Network64, requestAddress } from "shared/clientAddress.js";

/*
 * Counts requests per key and action in memory, in fixed windows
 * (RATE_LIMITS in core/config.ts). A key names who is counted: an address, an
 * account or a story seat, built below so the kinds never share a count. Who
 * is counted for what is decided in limitPolicy.ts. Log lines name the key's
 * kind and the action, never the key: addresses and account ids stay out of
 * the logs (the Privacy page, "IP Address").
 *
 * A request that awaits something before it is done (a database lookup, a
 * sign-up) claims its count before the await (claimRateLimit), so parallel
 * requests can't all pass the check at the same count; it hands the count back
 * when the request should not count after all.
 */

/**
 * The limit key of an address. All requests whose address can't be read share
 * one bucket, and an IPv6 address counts by its /64 network, which one
 * connection usually holds whole, so rotating through it changes nothing.
 */
export function addressKey(address: string | null): string {
  if (address === null) return "address:unknown";
  return `address:${ipv6Network64(address) ?? address}`;
}

export function accountKey(userId: string): string {
  return `account:${userId}`;
}

export function seatKey(storyId: string, playerSlot: string): string {
  return `seat:${storyId}:${playerSlot}`;
}

function kindOf(key: string): string {
  const colon = key.indexOf(":");
  return colon > 0 ? key.slice(0, colon) : "unknown";
}

interface LimitWindow {
  count: number;
  resetAt: number;
}

const windows = new Map<string, Map<RateLimitedAction, LimitWindow>>();

// Drops ended windows every 5 minutes; unref'd, so it never keeps the process alive
setInterval(() => {
  const now = Date.now();
  for (const [key, actions] of windows) {
    for (const [action, window] of actions) {
      if (window.resetAt <= now) actions.delete(action);
    }
    if (actions.size === 0) windows.delete(key);
  }
}, 5 * 60 * 1000).unref();

/** The key's running window for the action, a fresh one once the last has ended. */
function currentWindow(
  key: string,
  action: RateLimitedAction,
  now: number
): LimitWindow {
  let actions = windows.get(key);
  if (!actions) {
    actions = new Map();
    windows.set(key, actions);
  }
  let window = actions.get(action);
  if (!window || window.resetAt <= now) {
    window = { count: 0, resetAt: now + RATE_LIMITS[action].windowMs };
    actions.set(action, window);
  }
  return window;
}

/** The action's limit as it stands for a window, or for none (nothing counted yet). */
function limitInfo(
  action: RateLimitedAction,
  window: LimitWindow | undefined,
  now: number
): RateLimitInfo {
  const { maxRequests, windowMs } = RATE_LIMITS[action];
  const count = window?.count ?? 0;
  return {
    isLimited: count >= maxRequests,
    timeRemaining: window ? Math.max(0, window.resetAt - now) : 0,
    requestsRemaining: Math.max(0, maxRequests - count),
    maxRequests,
    windowMs,
  };
}

/** Whether the key has used up the action's requests in its current window. */
export function checkRateLimit(
  key: string,
  action: RateLimitedAction
): RateLimitInfo {
  const now = Date.now();
  const { maxRequests } = RATE_LIMITS[action];
  const info = limitInfo(action, currentWindow(key, action, now), now);
  Logger.Route.log(
    `[RateLimiter] ${kindOf(key)} ${action}: limited ${info.isLimited}, ` +
      `remaining ${info.requestsRemaining}/${maxRequests}, ` +
      `resets in ${Math.ceil(info.timeRemaining / 1000)}s`
  );
  return info;
}

/**
 * What checkRateLimit answers, for showing a caller its own allowance: it
 * counts nothing and starts no window, so reading never moves when the
 * allowance renews. A key with no running window has its whole allowance and
 * a timeRemaining of 0.
 */
export function peekRateLimit(
  key: string,
  action: RateLimitedAction
): RateLimitInfo {
  const now = Date.now();
  const window = windows.get(key)?.get(action);
  return limitInfo(action, window && window.resetAt > now ? window : undefined, now);
}

/** Counts one request of the key; a key already at its limit stays there. */
export function incrementRateLimit(
  key: string,
  action: RateLimitedAction
): void {
  const { maxRequests } = RATE_LIMITS[action];
  const window = currentWindow(key, action, Date.now());
  if (window.count < maxRequests) {
    window.count += 1;
  }
  Logger.Route.log(
    `[RateLimiter] ${kindOf(key)} ${action}: ${window.count}/${maxRequests} used`
  );
}

/**
 * A request counted against a limit when it was let through. refund() takes
 * the count back, once, and only while the window it was counted in still
 * runs: a later window never pays back an earlier one's request.
 */
export type RateLimitClaim =
  | { claimed: false; rateLimit: RateLimitInfo }
  | { claimed: true; refund: () => void };

/**
 * Checks the key's limit and, when it isn't reached, counts the request in
 * the same step, before the caller awaits anything.
 */
export function claimRateLimit(
  key: string,
  action: RateLimitedAction
): RateLimitClaim {
  const rateLimit = checkRateLimit(key, action);
  if (rateLimit.isLimited) return { claimed: false, rateLimit };

  const window = currentWindow(key, action, Date.now());
  window.count += 1;
  let refunded = false;
  return {
    claimed: true,
    refund: () => {
      if (refunded) return;
      refunded = true;
      const stillRunning =
        windows.get(key)?.get(action) === window && window.resetAt > Date.now();
      if (stillRunning && window.count > 0) {
        window.count -= 1;
      }
    },
  };
}

/** The request's address limit for the action (the editor's AI and image routes). */
export function checkRateLimitForRequest(
  req: Pick<Request, "socket" | "headers">,
  action: RateLimitedAction
): RateLimitInfo {
  return checkRateLimit(addressKey(requestAddress(req)), action);
}

export function incrementRateLimitForRequest(
  req: Pick<Request, "socket" | "headers">,
  action: RateLimitedAction
): void {
  incrementRateLimit(addressKey(requestAddress(req)), action);
}

/** claimRateLimit by the request's address (sign-up, login). */
export function claimRateLimitForRequest(
  req: Pick<Request, "socket" | "headers">,
  action: RateLimitedAction
): RateLimitClaim {
  return claimRateLimit(addressKey(requestAddress(req)), action);
}

/** An attempt that can fail, such as a code guess; only failures are counted. */
export type Attempt<T> = { succeeded: boolean; value: T };

export type LimitedAttempt<T> =
  | { limited: true; rateLimit: RateLimitInfo }
  | { limited: false; value: T };

/**
 * Runs the attempt unless the key is limited, and counts it only when it
 * fails: a class joining from one address by valid codes is never limited,
 * while someone guessing codes is. The attempt is counted while it runs, so
 * guesses sent in parallel meet the same cap as guesses sent one by one; a
 * success or a thrown error hands its count back.
 */
export async function limitFailures<T>(
  key: string,
  action: RateLimitedAction,
  attempt: () => Promise<Attempt<T>>
): Promise<LimitedAttempt<T>> {
  const claim = claimRateLimit(key, action);
  if (!claim.claimed) {
    return { limited: true, rateLimit: claim.rateLimit };
  }
  let outcome: Attempt<T>;
  try {
    outcome = await attempt();
  } catch (error) {
    claim.refund();
    throw error;
  }
  if (outcome.succeeded) claim.refund();
  return { limited: false, value: outcome.value };
}
