import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { RATE_LIMITS } from "core/config.js";
import {
  accountKey,
  addressKey,
  checkRateLimit,
  incrementRateLimit,
  limitFailures,
  seatKey,
} from "../../../src/shared/rateLimiter.js";

/*
 * The limiter counts per key: an address, an account or a story seat. The
 * store lives for the process, so every test uses keys of its own.
 */

let testNumber = 0;
/** A suffix no other test uses. */
function fresh(label: string): string {
  testNumber += 1;
  return `${label}-${testNumber}`;
}

function useUp(key: string, action: keyof typeof RATE_LIMITS): void {
  for (let i = 0; i < RATE_LIMITS[action].maxRequests; i++) {
    incrementRateLimit(key, action);
  }
}

let logged: string[];

beforeEach(() => {
  logged = [];
  for (const method of ["log", "warn", "error"] as const) {
    jest.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      logged.push(args.map(String).join(" "));
    });
  }
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("keyed counts", () => {
  it("keeps address, account and seat counts apart even when their names match", () => {
    const suffix = fresh("story");
    const seat = seatKey(suffix, "player1");
    const account = accountKey(`${suffix}:player1`);
    const address = addressKey(`${suffix}:player1`);

    useUp(seat, "make_choice");

    expect(checkRateLimit(seat, "make_choice").isLimited).toBe(true);
    expect(checkRateLimit(account, "make_choice").isLimited).toBe(false);
    expect(checkRateLimit(address, "make_choice").isLimited).toBe(false);
  });

  it("puts every request without an address in one shared bucket", () => {
    expect(addressKey(null)).toBe(addressKey(null));
    expect(addressKey(null)).not.toBe(addressKey("198.51.100.23"));
  });

  it("limits a key once it has used its requests, and frees it when the window ends", () => {
    jest.useFakeTimers();
    const key = accountKey(fresh("teacher"));
    const { maxRequests, windowMs } = RATE_LIMITS.initialize_story_text;

    for (let i = 0; i < maxRequests - 1; i++) {
      incrementRateLimit(key, "initialize_story_text");
    }
    expect(checkRateLimit(key, "initialize_story_text").isLimited).toBe(false);
    incrementRateLimit(key, "initialize_story_text");
    expect(checkRateLimit(key, "initialize_story_text")).toMatchObject({
      isLimited: true,
      requestsRemaining: 0,
    });

    jest.advanceTimersByTime(windowMs + 1);

    expect(checkRateLimit(key, "initialize_story_text")).toMatchObject({
      isLimited: false,
      requestsRemaining: maxRequests,
    });
  });
});

describe("limitFailures", () => {
  const failed = async () => ({ succeeded: false, value: "invalid" });
  const succeeded = async () => ({ succeeded: true, value: "joined" });

  it("limits a key after its allowance of failures", async () => {
    const key = addressKey(fresh("school"));

    for (let i = 0; i < RATE_LIMITS.verify_code.maxRequests; i++) {
      expect(await limitFailures(key, "verify_code", failed)).toEqual({
        limited: false,
        value: "invalid",
      });
    }

    expect(await limitFailures(key, "verify_code", failed)).toMatchObject({
      limited: true,
    });
  });

  it("never counts a success, so a class behind one address can all join", async () => {
    const key = addressKey(fresh("classroom"));

    for (let i = 0; i < RATE_LIMITS.verify_code.maxRequests * 3; i++) {
      await limitFailures(key, "verify_code", succeeded);
    }

    expect(checkRateLimit(key, "verify_code")).toMatchObject({
      isLimited: false,
      requestsRemaining: RATE_LIMITS.verify_code.maxRequests,
    });
  });

  it("refuses a limited key without running the attempt, even one that would succeed", async () => {
    const key = addressKey(fresh("guesser"));
    useUp(key, "verify_code");
    const attempt = jest.fn(succeeded);

    const outcome = await limitFailures(key, "verify_code", attempt);

    expect(outcome).toMatchObject({ limited: true });
    expect(attempt).not.toHaveBeenCalled();
  });
});

describe("logging", () => {
  it("names the key's kind and the action, never the address or the account", async () => {
    const address = "198.51.100.23";
    const userId = fresh("user-id");

    checkRateLimit(addressKey(address), "login");
    incrementRateLimit(addressKey(address), "login");
    incrementRateLimit(accountKey(userId), "initialize_story_text");
    await limitFailures(addressKey(address), "verify_code", async () => ({
      succeeded: false,
      value: null,
    }));

    expect(logged.length).toBeGreaterThan(0);
    expect(logged.join("\n")).toContain("address");
    for (const line of logged) {
      expect(line).not.toContain(address);
      expect(line).not.toContain(userId);
    }
  });
});
