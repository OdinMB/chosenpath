import { describe, expect, it } from "@jest/globals";
import { RATE_LIMITS } from "core/config.js";
import { PACE_MARGIN_MS, choiceLimit, choiceLimitIn, choicePacer } from "../../../../harness/lib/choice-pace.mjs";

/*
 * The product's limit on a seat's choices as the harness reads it from
 * core/config.ts, and the pacer that keeps a journey's clicks under it, on a
 * fake clock: its sleep moves the clock on instead of waiting.
 */

function fakeClock(start = 0) {
  const clock = { now: start, sleeps: [] as number[] };
  return {
    clock,
    now: () => clock.now,
    sleep: async (ms: number) => {
      clock.sleeps.push(ms);
      clock.now += ms;
    },
  };
}

describe("the limit on a seat's choices", () => {
  it("is read from core/config.ts as the server applies it", () => {
    expect(choiceLimit()).toEqual({ windowMs: RATE_LIMITS.make_choice.windowMs, maxRequests: RATE_LIMITS.make_choice.maxRequests });
  });

  it("reads a window written as a product or with separators", () => {
    const config = (window: string) => `export const RATE_LIMITED_ACTIONS = ["make_choice"];\nexport const RATE_LIMITS: Record<string, unknown> = {\n  make_choice: {\n    windowMs: ${window}, // a comment\n    maxRequests: 7,\n  },\n};`;
    expect(choiceLimitIn(config("60 * 1000"))).toEqual({ windowMs: 60_000, maxRequests: 7 });
    expect(choiceLimitIn(config("45_000"))).toEqual({ windowMs: 45_000, maxRequests: 7 });
    expect(choiceLimitIn(config("2 * 60 * 1000"))).toEqual({ windowMs: 120_000, maxRequests: 7 });
  });

  it("refuses a config it can't read, rather than guess", () => {
    expect(() => choiceLimitIn("export const RATE_LIMITS = { login: { windowMs: 1000, maxRequests: 2 } };")).toThrow("RATE_LIMITS.make_choice");
    expect(() => choiceLimitIn("export const RATE_LIMITS: X = { make_choice: { windowMs: WINDOW, maxRequests: 4 } };")).toThrow("RATE_LIMITS.make_choice");
    expect(() => choiceLimitIn('const actions = ["make_choice"]; const make_choice: { windowMs: 1000, maxRequests: 4 } = x;')).toThrow("RATE_LIMITS.make_choice");
  });
});

describe("pacing a seat's events", () => {
  const limit = { windowMs: 30_000, maxRequests: 4 };

  it("lets the limit's count through at once, then waits until the oldest is the window and the margin back", async () => {
    const { clock, now, sleep } = fakeClock();
    const pacer = choicePacer({ limit, marginMs: 2_000, now, sleep });
    const sentAt: number[] = [];
    const send = () => void sentAt.push(clock.now);
    for (let i = 0; i < 4; i++) {
      await expect(pacer.pace(send)).resolves.toBe(0);
      clock.now += 1_000;
    }
    expect(pacer.waitMs()).toBe(28_000);
    await expect(pacer.pace(send)).resolves.toBe(28_000);
    expect(sentAt).toEqual([0, 1_000, 2_000, 3_000, 32_000]);
    expect(clock.sleeps).toEqual([28_000]);
  });

  it("counts an event sent another way", async () => {
    const { clock, now, sleep } = fakeClock(5_000);
    const pacer = choicePacer({ limit, marginMs: 2_000, now, sleep }).record();
    for (let i = 0; i < 3; i++) await pacer.pace(() => undefined);
    expect(pacer.waitMs()).toBe(limit.windowMs + 2_000);
    await pacer.pace(() => undefined);
    expect(clock.now).toBe(5_000 + limit.windowMs + 2_000);
  });

  it("takes core/config.ts's limit and the default margin when given none", async () => {
    const { clock, now, sleep } = fakeClock();
    const pacer = choicePacer({ now, sleep });
    expect(pacer.limit).toEqual(choiceLimit());
    for (let i = 0; i < pacer.limit.maxRequests; i++) await pacer.pace(() => undefined);
    expect(pacer.waitMs()).toBe(pacer.limit.windowMs + PACE_MARGIN_MS);
    expect(clock.sleeps).toEqual([]);
  });

  it("records nothing for a send that fails", async () => {
    const { now, sleep } = fakeClock();
    const pacer = choicePacer({ limit: { windowMs: 30_000, maxRequests: 1 }, marginMs: 0, now, sleep });
    await expect(
      pacer.pace(async () => {
        throw new Error("the button went away");
      })
    ).rejects.toThrow("the button went away");
    expect(pacer.waitMs()).toBe(0);
  });
});
