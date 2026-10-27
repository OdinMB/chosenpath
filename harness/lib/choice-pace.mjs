// The product's limit on choices, read from core/config.ts
// (RATE_LIMITS.make_choice: character picks, choices and turn retries all
// count against it), and a pacer that keeps a journey's clicks under it. The
// server turns away an event over the limit and the game shows nothing, so a
// journey that clicked faster would wait for a beat that never comes.
//
// Who shares a count is the server's choiceLimitKey (limitPolicy.ts). A seat
// counts on its own only in a story an account started, from a socket that
// holds a seat; everything else counts per address, and in the harness every
// page comes from 127.0.0.1. One pacer stands for one count: a seat's own, or
// one that every seat of such a story shares.
//
// The server counts in fixed windows, each starting at the first event after
// the last one ended. A pacer never lets more events than the limit's count
// fall within the window's length plus a margin, so no fixed window can hold
// more either. The margin covers the time from a click to the server counting
// it.

import fs from "node:fs";

const CORE_CONFIG = new URL("../../core/config.ts", import.meta.url);

/** Added to the window: more than a click takes, on one machine, to reach the server's count. */
export const PACE_MARGIN_MS = 2_000;

/** A product of whole numbers as core/config.ts writes a window (`30 * 1000`, `30_000`); NaN for anything else. */
function product(expression) {
  const factors = String(expression ?? "")
    .split("*")
    .map((factor) => factor.trim());
  if (factors.some((factor) => !/^\d+(?:_\d+)*$/.test(factor))) return NaN;
  return factors.reduce((total, factor) => total * Number(factor.replaceAll("_", "")), 1);
}

/**
 * The limit on choices in core/config.ts's text: RATE_LIMITS.make_choice's
 * window in milliseconds and its count. Throws where the text no longer has
 * the form read here, rather than guess.
 */
export function choiceLimitIn(configText) {
  const text = String(configText ?? "");
  const from = text.indexOf("RATE_LIMITS:");
  const entry = from >= 0 ? (text.slice(from).match(/\bmake_choice:\s*\{([^}]*)\}/)?.[1] ?? "") : "";
  const windowMs = product(entry.match(/\bwindowMs:\s*([^,\n]+?)\s*,/)?.[1]);
  const maxRequests = Number(entry.match(/\bmaxRequests:\s*(\d+)\b/)?.[1]);
  if (!(windowMs > 0) || !(maxRequests > 0)) {
    throw new Error("core/config.ts's RATE_LIMITS.make_choice no longer reads as { windowMs: <whole numbers multiplied>, maxRequests: <whole number> }; harness/lib/choice-pace.mjs reads it there");
  }
  return { windowMs, maxRequests };
}

let configured;

/** The limit on choices as core/config.ts sets it, read once. */
export function choiceLimit() {
  configured ??= choiceLimitIn(fs.readFileSync(CORE_CONFIG, "utf8"));
  return configured;
}

const realSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Keeps the events of one count (a seat's, or every seat's where they share
 * one) under `limit` (core/config.ts's by default).
 * `pace(send)` waits until the count's last `maxRequests` events all lie more
 * than the window and `marginMs` back, sends, records the event once `send`
 * has resolved (a click resolves once it is dispatched), and resolves with the
 * milliseconds it waited. `waitMs()` says how long that wait is now.
 * `record()` counts an event sent another way, and returns the pacer. `now`
 * and `sleep` are its clock, replaced in tests.
 */
export function choicePacer({ limit = choiceLimit(), marginMs = PACE_MARGIN_MS, now = Date.now, sleep = realSleep } = {}) {
  // The times of the count's last events, oldest first; never more than the limit's count
  const sent = [];
  const pacer = {
    limit,
    waitMs: () => (sent.length < limit.maxRequests ? 0 : Math.max(0, sent[0] + limit.windowMs + marginMs - now())),
    record: () => {
      sent.push(now());
      if (sent.length > limit.maxRequests) sent.shift();
      return pacer;
    },
    pace: async (send) => {
      let waited = 0;
      for (let ms = pacer.waitMs(); ms > 0; ms = pacer.waitMs()) {
        await sleep(ms);
        waited += ms;
      }
      await send();
      pacer.record();
      return waited;
    },
  };
  return pacer;
}
