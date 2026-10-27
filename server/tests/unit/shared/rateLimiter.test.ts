import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { RATE_LIMITS } from "core/config.js";
import {
  accountKey,
  addressKey,
  checkRateLimit,
  claimRateLimit,
  incrementRateLimit,
  limitFailures,
  peekRateLimit,
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

  it("holds the cap for guesses sent in parallel, each awaiting its lookup", async () => {
    const key = addressKey(fresh("burst"));
    const { maxRequests } = RATE_LIMITS.verify_code;
    const slowFailure = async () => {
      await new Promise((resolve) => setImmediate(resolve));
      return { succeeded: false, value: "invalid" };
    };

    const outcomes = await Promise.all(
      Array.from({ length: maxRequests * 3 }, () =>
        limitFailures(key, "verify_code", slowFailure)
      )
    );

    expect(outcomes.filter((outcome) => !outcome.limited)).toHaveLength(maxRequests);
    expect(checkRateLimit(key, "verify_code").isLimited).toBe(true);
  });

  it("hands back the count of an attempt that throws", async () => {
    const key = addressKey(fresh("outage"));

    await expect(
      limitFailures(key, "verify_code", async () => {
        throw new Error("database unavailable");
      })
    ).rejects.toThrow("database unavailable");

    expect(checkRateLimit(key, "verify_code").requestsRemaining).toBe(
      RATE_LIMITS.verify_code.maxRequests
    );
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

describe("claimRateLimit", () => {
  it("counts a request when it lets it through, so parallel requests can't share a count", () => {
    const key = accountKey(fresh("teacher"));
    const { maxRequests } = RATE_LIMITS.initialize_story_images;

    const claims = Array.from({ length: maxRequests + 3 }, () =>
      claimRateLimit(key, "initialize_story_images")
    );

    expect(claims.filter((claim) => claim.claimed)).toHaveLength(maxRequests);
    expect(claims[maxRequests]).toMatchObject({ claimed: false, rateLimit: { isLimited: true } });
  });

  it("takes a refunded count back once", () => {
    const key = addressKey(fresh("signup"));
    const claim = claimRateLimit(key, "register");
    claimRateLimit(key, "register");
    if (!claim.claimed) throw new Error("the first claim was refused");

    claim.refund();
    claim.refund();

    expect(checkRateLimit(key, "register").requestsRemaining).toBe(
      RATE_LIMITS.register.maxRequests - 1
    );
  });

  it("never refunds into a later window", () => {
    jest.useFakeTimers();
    const key = addressKey(fresh("late"));
    const { windowMs } = RATE_LIMITS.verify_code;
    const early = claimRateLimit(key, "verify_code");
    if (!early.claimed) throw new Error("the first claim was refused");

    jest.advanceTimersByTime(windowMs + 1);
    claimRateLimit(key, "verify_code");
    early.refund();

    expect(checkRateLimit(key, "verify_code").requestsRemaining).toBe(
      RATE_LIMITS.verify_code.maxRequests - 1
    );
  });
});

describe("peekRateLimit", () => {
  it("reads a key's running count however often, without counting a request", () => {
    const key = accountKey(fresh("teacher"));
    const { maxRequests } = RATE_LIMITS.initialize_story_text;
    for (let i = 0; i < 3; i++) incrementRateLimit(key, "initialize_story_text");

    for (let i = 0; i < maxRequests * 2; i++) {
      expect(peekRateLimit(key, "initialize_story_text")).toMatchObject({
        isLimited: false,
        requestsRemaining: maxRequests - 3,
        maxRequests,
      });
    }

    const claims = Array.from({ length: maxRequests }, () =>
      claimRateLimit(key, "initialize_story_text")
    );
    expect(claims.filter((claim) => claim.claimed)).toHaveLength(maxRequests - 3);
  });

  it("says how long the running window has left", () => {
    jest.useFakeTimers();
    const key = accountKey(fresh("teacher"));
    const { windowMs } = RATE_LIMITS.initialize_story_text;
    incrementRateLimit(key, "initialize_story_text");

    jest.advanceTimersByTime(20 * 60 * 1000);

    expect(peekRateLimit(key, "initialize_story_text").timeRemaining).toBe(
      windowMs - 20 * 60 * 1000
    );
  });

  it("starts no window: a key read before its first request still gets a whole window from that request", () => {
    jest.useFakeTimers();
    const key = accountKey(fresh("teacher"));
    const { maxRequests, windowMs } = RATE_LIMITS.initialize_story_text;

    expect(peekRateLimit(key, "initialize_story_text")).toEqual({
      isLimited: false,
      timeRemaining: 0,
      requestsRemaining: maxRequests,
      maxRequests,
      windowMs,
    });
    jest.advanceTimersByTime(windowMs / 2);
    incrementRateLimit(key, "initialize_story_text");
    jest.advanceTimersByTime(windowMs / 2 + 1);

    // Had the read started the window, it would have ended by now
    expect(peekRateLimit(key, "initialize_story_text")).toMatchObject({
      requestsRemaining: maxRequests - 1,
      timeRemaining: windowMs / 2 - 1,
    });
  });

  it("has the whole allowance back once the window has ended", () => {
    jest.useFakeTimers();
    const key = accountKey(fresh("teacher"));
    const { maxRequests, windowMs } = RATE_LIMITS.initialize_story_text;
    useUp(key, "initialize_story_text");
    expect(peekRateLimit(key, "initialize_story_text").isLimited).toBe(true);

    jest.advanceTimersByTime(windowMs + 1);

    expect(peekRateLimit(key, "initialize_story_text")).toMatchObject({
      isLimited: false,
      requestsRemaining: maxRequests,
      timeRemaining: 0,
    });
  });

  it("reads only the key it is given", () => {
    const used = accountKey(fresh("teacher"));
    const other = accountKey(fresh("teacher"));
    useUp(used, "initialize_story_text");

    expect(peekRateLimit(other, "initialize_story_text").requestsRemaining).toBe(
      RATE_LIMITS.initialize_story_text.maxRequests
    );
  });
});

describe("address keys", () => {
  it("counts an IPv6 address by its /64 network, so rotating within it changes nothing", () => {
    expect(addressKey("2001:db8:abcd:12:1:2:3:4")).toBe(addressKey("2001:db8:abcd:12:ffff::9"));
    expect(addressKey("2001:db8:abcd:12::1")).not.toBe(addressKey("2001:db8:abcd:13::1"));
    expect(addressKey("2001:db8:abcd:12::1")).toBe("address:2001:db8:abcd:12::/64");
  });

  it("keeps IPv4 addresses whole", () => {
    expect(addressKey("198.51.100.23")).toBe("address:198.51.100.23");
    expect(addressKey("198.51.100.23")).not.toBe(addressKey("198.51.100.24"));
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
