import type { StartsLeftInfo } from "core/types/api";
// Named as a plain function: the runner below calls it outside a component,
// standing in for React, which the rules of hooks can't tell
import { useStartsLeft as startsLeftHook } from "../../../src/page/hooks/useStartsLeft";

/*
 * The account's starts left on "Start several stories at once": read when
 * the box is ticked and on refresh() (after a start that started nothing),
 * and renewed on this device when the allowance renews, without asking the
 * server again, so nothing can fail while nobody acts.
 *
 * The client tests have no DOM to render a hook in, so React's hooks are
 * stood in for by a small runner: state kept between calls, and after each
 * call the effects whose dependencies changed, each after its last cleanup.
 */

type Cleanup = (() => void) | void;
type EffectSlot = { deps: unknown[] | undefined; cleanup: Cleanup };

const mockRuntime = {
  states: [] as unknown[],
  effects: [] as EffectSlot[],
  pending: [] as (() => void)[],
  stateIndex: 0,
  effectIndex: 0,
  changed: false,
};

const sameDeps = (a: unknown[] | undefined, b: unknown[] | undefined): boolean =>
  a !== undefined &&
  b !== undefined &&
  a.length === b.length &&
  a.every((dep, index) => Object.is(dep, b[index]));

jest.mock("react", () => ({
  ...jest.requireActual("react"),
  useState: (initial: unknown) => {
    const index = mockRuntime.stateIndex++;
    if (!(index in mockRuntime.states)) mockRuntime.states[index] = initial;
    const set = (next: unknown) => {
      const value =
        typeof next === "function"
          ? (next as (current: unknown) => unknown)(mockRuntime.states[index])
          : next;
      if (Object.is(value, mockRuntime.states[index])) return;
      mockRuntime.states[index] = value;
      mockRuntime.changed = true;
    };
    return [mockRuntime.states[index], set];
  },
  useEffect: (effect: () => Cleanup, deps?: unknown[]) => {
    const index = mockRuntime.effectIndex++;
    const previous = mockRuntime.effects[index];
    if (previous && sameDeps(previous.deps, deps)) return;
    mockRuntime.pending.push(() => {
      if (typeof previous?.cleanup === "function") previous.cleanup();
      mockRuntime.effects[index] = { deps, cleanup: effect() };
    });
  },
  useCallback: (callback: unknown) => callback,
}));

const mockGetStartsLeft = jest.fn<Promise<StartsLeftInfo>, []>();
jest.mock("../../../src/shared/apiClient", () => ({
  storyApi: { getStartsLeft: () => mockGetStartsLeft() },
}));

type HookResult = ReturnType<typeof startsLeftHook>;

/** Calls the hook as a render would, then runs its effects, until its state settles. */
function render(enabled: boolean, account?: object | null): HookResult {
  for (let pass = 0; pass < 10; pass++) {
    mockRuntime.stateIndex = 0;
    mockRuntime.effectIndex = 0;
    mockRuntime.changed = false;
    const result = startsLeftHook(enabled, account);
    for (const run of mockRuntime.pending.splice(0)) run();
    if (!mockRuntime.changed) return result;
  }
  throw new Error("the hook's state never settled");
}

/** Lets a read's answer arrive, then renders again. */
async function settle(enabled: boolean, account?: object | null): Promise<HookResult> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
  return render(enabled, account);
}

const MINUTE = 60 * 1000;
const NOW = Date.UTC(2026, 9, 27, 13, 0);
const answer = (remaining: number, resetsInMs: number | null): StartsLeftInfo => ({
  remaining,
  limit: 15,
  windowMs: 60 * MINUTE,
  resetsInMs,
});

let warned: unknown[][];

beforeEach(() => {
  mockRuntime.states = [];
  mockRuntime.effects = [];
  mockRuntime.pending = [];
  mockGetStartsLeft.mockReset();
  jest.useFakeTimers({ now: NOW });
  warned = [];
  jest.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
    warned.push(args);
  });
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("useStartsLeft", () => {
  it("reads nothing until the box is ticked, then reads once", async () => {
    mockGetStartsLeft.mockResolvedValue(answer(7, 20 * MINUTE));

    expect(render(false).startsLeft).toBeNull();
    expect(mockGetStartsLeft).not.toHaveBeenCalled();

    render(true);
    const { startsLeft } = await settle(true);

    expect(mockGetStartsLeft).toHaveBeenCalledTimes(1);
    expect(startsLeft).toEqual({
      remaining: 7,
      limit: 15,
      windowMs: 60 * MINUTE,
      renewsAt: NOW + 20 * MINUTE,
    });
  });

  it("gives the whole allowance back when it renews, without reading again", async () => {
    mockGetStartsLeft.mockResolvedValueOnce(answer(0, 20 * MINUTE));
    render(true);
    expect((await settle(true)).startsLeft?.remaining).toBe(0);
    // A read now would fail, and its pop-up would come from nothing the user did
    mockGetStartsLeft.mockRejectedValue(new Error("offline"));

    jest.advanceTimersByTime(20 * MINUTE + 1000);
    const { startsLeft } = await settle(true);

    expect(startsLeft).toMatchObject({ remaining: 15, renewsAt: null });
    expect(mockGetStartsLeft).toHaveBeenCalledTimes(1);
    expect(warned).toEqual([]);
  });

  it("keeps the count until the allowance renews", async () => {
    mockGetStartsLeft.mockResolvedValue(answer(3, 20 * MINUTE));
    render(true);
    await settle(true);

    jest.advanceTimersByTime(19 * MINUTE);

    expect(render(true).startsLeft?.remaining).toBe(3);
  });

  it("shows no count when a read fails, and throws nothing", async () => {
    mockGetStartsLeft.mockRejectedValue(new Error("offline"));

    render(true);
    const { startsLeft } = await settle(true);

    expect(startsLeft).toBeNull();
    expect(warned).toHaveLength(1);
  });

  it("reads again on refresh, and when the box is ticked again", async () => {
    mockGetStartsLeft.mockResolvedValueOnce(answer(7, 20 * MINUTE));
    render(true);
    const { refresh } = await settle(true);

    mockGetStartsLeft.mockResolvedValueOnce(answer(4, 20 * MINUTE));
    refresh();
    render(true);
    expect((await settle(true)).startsLeft?.remaining).toBe(4);

    mockGetStartsLeft.mockResolvedValueOnce(answer(2, 20 * MINUTE));
    render(false);
    render(true);
    expect((await settle(true)).startsLeft?.remaining).toBe(2);
    expect(mockGetStartsLeft).toHaveBeenCalledTimes(3);
  });

  it("reads again for a new sign-in, such as after the sign-in lapsed", async () => {
    // A read while the sign-in had lapsed failed, so no count is shown
    mockGetStartsLeft.mockRejectedValueOnce(new Error("Authentication required"));
    const signedIn = { id: "user-1" };
    render(true, signedIn);
    expect((await settle(true, signedIn)).startsLeft).toBeNull();
    // The same sign-in reads nothing more
    render(true, signedIn);
    expect(mockGetStartsLeft).toHaveBeenCalledTimes(1);

    mockGetStartsLeft.mockResolvedValueOnce(answer(5, 20 * MINUTE));
    const signedInAgain = { id: "user-1" };
    render(true, signedInAgain);
    const { startsLeft } = await settle(true, signedInAgain);

    expect(startsLeft?.remaining).toBe(5);
    expect(mockGetStartsLeft).toHaveBeenCalledTimes(2);
  });

  it("reads nothing for a sign-in while the box is not ticked", () => {
    render(false, { id: "user-1" });
    render(false, { id: "user-1" });

    expect(mockGetStartsLeft).not.toHaveBeenCalled();
  });
});
