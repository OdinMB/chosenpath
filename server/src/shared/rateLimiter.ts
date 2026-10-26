import type { Request } from "express";
import { RateLimitedAction, RATE_LIMITS } from "core/config.js";
import { RateLimitInfo } from "core/types/api.js";
import { Logger } from "shared/logger.js";
import { requestAddress } from "shared/clientAddress.js";

/*
 * Counts requests per key and action in memory, in fixed windows
 * (RATE_LIMITS in core/config.ts). A key names who is counted: an address, an
 * account or a story seat, built below so the kinds never share a count. Who
 * is counted for what is decided in limitPolicy.ts. Log lines name the key's
 * kind and the action, never the key: addresses and account ids stay out of
 * the logs (the Privacy page, "IP Address").
 */

/** All requests whose address can't be read share this one bucket. */
export function addressKey(address: string | null): string {
  return `address:${address ?? "unknown"}`;
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

/** Whether the key has used up the action's requests in its current window. */
export function checkRateLimit(
  key: string,
  action: RateLimitedAction
): RateLimitInfo {
  const now = Date.now();
  const { maxRequests, windowMs } = RATE_LIMITS[action];
  const window = currentWindow(key, action, now);
  const info: RateLimitInfo = {
    isLimited: window.count >= maxRequests,
    timeRemaining: Math.max(0, window.resetAt - now),
    requestsRemaining: Math.max(0, maxRequests - window.count),
    maxRequests,
    windowMs,
  };
  Logger.Route.log(
    `[RateLimiter] ${kindOf(key)} ${action}: limited ${info.isLimited}, ` +
      `remaining ${info.requestsRemaining}/${maxRequests}, ` +
      `resets in ${Math.ceil(info.timeRemaining / 1000)}s`
  );
  return info;
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

/** The request's address limit for the action (login, the editor's AI and image routes, sign-up). */
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

/** An attempt that can fail, such as a code guess; only failures are counted. */
export type Attempt<T> = { succeeded: boolean; value: T };

export type LimitedAttempt<T> =
  | { limited: true; rateLimit: RateLimitInfo }
  | { limited: false; value: T };

/**
 * Runs the attempt unless the key is already limited, and counts it only when
 * it fails: a class joining from one address by valid codes is never
 * limited, while someone guessing codes is. A thrown error is not counted.
 */
export async function limitFailures<T>(
  key: string,
  action: RateLimitedAction,
  attempt: () => Promise<Attempt<T>>
): Promise<LimitedAttempt<T>> {
  const rateLimit = checkRateLimit(key, action);
  if (rateLimit.isLimited) {
    return { limited: true, rateLimit };
  }
  const outcome = await attempt();
  if (!outcome.succeeded) {
    incrementRateLimit(key, action);
  }
  return { limited: false, value: outcome.value };
}
