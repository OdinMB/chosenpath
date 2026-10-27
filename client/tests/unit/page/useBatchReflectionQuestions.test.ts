import type { TemplateReflectionOutcome } from "core/types/api";
// Named as a plain function: the runner below calls it outside a component,
// standing in for React, which the rules of hooks can't tell
import { useBatchReflectionQuestions as batchReflectionHook } from "../../../src/page/hooks/useBatchReflectionQuestions";

/*
 * The reflection questions of several stories at once: the World's are read
 * once the box is ticked and kept while the form is open; a read that failed
 * is tried again for the next sign-in, or the next time the box is ticked.
 *
 * The client tests have no DOM to render a hook in, so React's hooks are
 * stood in for by a small runner: state and refs kept between calls, and
 * after each call the effects whose dependencies changed.
 */

type Cleanup = (() => void) | void;
type EffectSlot = { deps: unknown[] | undefined; cleanup: Cleanup };

const mockRuntime = {
  states: [] as unknown[],
  refs: [] as { current: unknown }[],
  effects: [] as EffectSlot[],
  pending: [] as (() => void)[],
  stateIndex: 0,
  refIndex: 0,
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
  useRef: (initial: unknown) => {
    const index = mockRuntime.refIndex++;
    if (!(index in mockRuntime.refs)) mockRuntime.refs[index] = { current: initial };
    return mockRuntime.refs[index];
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
}));

const mockGetReflectionQuestions = jest.fn<Promise<TemplateReflectionOutcome[]>, [string]>();
jest.mock("../../../src/resources/templates/templateApi", () => ({
  templateApi: {
    getReflectionQuestions: (templateId: string) => mockGetReflectionQuestions(templateId),
  },
}));

type HookResult = ReturnType<typeof batchReflectionHook>;

/** Calls the hook as a render would, then runs its effects, until its state settles. */
function render(active: boolean, account?: object | null): HookResult {
  for (let pass = 0; pass < 10; pass++) {
    mockRuntime.stateIndex = 0;
    mockRuntime.refIndex = 0;
    mockRuntime.effectIndex = 0;
    mockRuntime.changed = false;
    const result = batchReflectionHook("world-1", active, account);
    for (const run of mockRuntime.pending.splice(0)) run();
    if (!mockRuntime.changed) return result;
  }
  throw new Error("the hook's state never settled");
}

/** Lets a read's answer arrive, then renders again. */
async function settle(active: boolean, account?: object | null): Promise<HookResult> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
  return render(active, account);
}

const WORLD: TemplateReflectionOutcome[] = [
  { id: "shared_harbour", owner: "shared", question: "Will the harbour hold?", reflectionQuestions: ["Who paid?"] },
];

beforeEach(() => {
  mockRuntime.states = [];
  mockRuntime.refs = [];
  mockRuntime.effects = [];
  mockRuntime.pending = [];
  mockGetReflectionQuestions.mockReset();
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("useBatchReflectionQuestions", () => {
  it("reads nothing until the box is ticked, then the World's questions once", async () => {
    mockGetReflectionQuestions.mockResolvedValue(WORLD);
    const account = {};

    render(false, account);
    expect(mockGetReflectionQuestions).not.toHaveBeenCalled();

    render(true, account);
    const loaded = await settle(true, account);

    expect(mockGetReflectionQuestions).toHaveBeenCalledWith("world-1");
    expect(loaded.status).toBe("ready");
    expect(loaded.drafts).toEqual({ shared_harbour: ["Who paid?"] });
  });

  it("keeps the questions as changed when the box is unticked and ticked again, without reading again", async () => {
    mockGetReflectionQuestions.mockResolvedValue(WORLD);
    const account = {};
    render(true, account);
    (await settle(true, account)).setQuestions("shared_harbour", ["Who stayed?"]);

    render(false, account);
    const again = render(true, account);

    expect(mockGetReflectionQuestions).toHaveBeenCalledTimes(1);
    expect(again.drafts).toEqual({ shared_harbour: ["Who stayed?"] });
    expect(again.requestQuestions(1)).toEqual({ shared_harbour: ["Who stayed?"] });
  });

  it("sends nothing after a failed read, so the stories take the World's, and doesn't read again on its own", async () => {
    mockGetReflectionQuestions.mockRejectedValue(new Error("signed out"));
    const account = {};
    render(true, account);

    const failed = await settle(true, account);
    render(true, account);

    expect(failed.status).toBe("failed");
    expect(failed.requestQuestions(1)).toBeUndefined();
    expect(mockGetReflectionQuestions).toHaveBeenCalledTimes(1);
  });

  it("reads again after a failed read once someone signs in again", async () => {
    mockGetReflectionQuestions.mockRejectedValueOnce(new Error("signed out"));
    const lapsed = {};
    render(true, lapsed);
    expect((await settle(true, lapsed)).status).toBe("failed");

    mockGetReflectionQuestions.mockResolvedValue(WORLD);
    const signedInAgain = {};
    render(true, signedInAgain);
    const loaded = await settle(true, signedInAgain);

    expect(mockGetReflectionQuestions).toHaveBeenCalledTimes(2);
    expect(loaded.status).toBe("ready");
    expect(loaded.requestQuestions(1)).toEqual({ shared_harbour: ["Who paid?"] });
  });
});
