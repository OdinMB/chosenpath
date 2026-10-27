import {
  addCodeSetStartedForOthers,
  addCodeSetToStorage,
  getCodesStartedForOthers,
  getStoredCodeSets,
} from "../../../src/shared/utils/codeSetUtils";

/*
 * Seat codes started for other players to play ("Start several stories at
 * once") are stored on the device like any other, so their stories show on
 * the home page and My Stories, and carry a mark that keeps them from ever
 * being linked to the device's account. The mark lives beside the code sets,
 * whose format stays as it was: a page that doesn't know the marks reads the
 * code sets unchanged.
 */

// The real config reads import.meta.env, which Jest cannot parse
jest.mock("../../../src/config", () =>
  jest.requireActual("../../__mocks__/client/config")
);

const CODE_SETS_KEY = "playerCodeSets";
const MARKS_KEY = "playerCodesStartedForOthers";

/** This device's storage, kept in memory. */
function deviceStorage() {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => {
      items.set(key, value);
    },
    removeItem: (key: string) => {
      items.delete(key);
    },
  };
}

const global = globalThis as { localStorage?: unknown };
let storageBefore: unknown;
let storage: ReturnType<typeof deviceStorage>;

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => undefined);
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
  // Unreadable marks are logged as errors
  jest.spyOn(console, "error").mockImplementation(() => undefined);
  storageBefore = global.localStorage;
  storage = deviceStorage();
  global.localStorage = storage;
});

afterEach(() => {
  global.localStorage = storageBefore;
  jest.restoreAllMocks();
});

describe("addCodeSetStartedForOthers", () => {
  it("stores the code set like any other and marks its codes", () => {
    addCodeSetStartedForOthers(["A-1", "A-2", "A-3"]);

    expect(getStoredCodeSets()).toEqual([["A-1", "A-2", "A-3"]]);
    expect(getCodesStartedForOthers()).toEqual(["A-1", "A-2", "A-3"]);
  });

  it("keeps the code sets in their format, a list of lists of codes", () => {
    addCodeSetToStorage(["OWN-1"]);
    addCodeSetStartedForOthers(["A-1", "A-2"]);

    expect(JSON.parse(storage.items.get(CODE_SETS_KEY)!)).toEqual([
      ["OWN-1"],
      ["A-1", "A-2"],
    ]);
  });

  it("adds to the marks of earlier stories started for others", () => {
    addCodeSetStartedForOthers(["A-1", "A-2"]);
    addCodeSetStartedForOthers(["B-1", "B-2"]);

    expect(getCodesStartedForOthers()).toEqual(["A-1", "A-2", "B-1", "B-2"]);
  });

  it("drops the marks of codes no longer stored", () => {
    addCodeSetStartedForOthers(["A-1", "A-2"]);
    storage.setItem(CODE_SETS_KEY, JSON.stringify([]));

    addCodeSetStartedForOthers(["B-1"]);

    expect(getCodesStartedForOthers()).toEqual(["B-1"]);
  });
});

describe("getCodesStartedForOthers", () => {
  it("marks nothing a single start stores", () => {
    addCodeSetToStorage(["OWN-1", "OWN-2"]);

    expect(getCodesStartedForOthers()).toEqual([]);
  });

  it("marks nothing stored before the marks existed", () => {
    storage.setItem(CODE_SETS_KEY, JSON.stringify([["OLD-1", "OLD-2"]]));

    expect(getCodesStartedForOthers()).toEqual([]);
  });

  it("reads unreadable marks as none, and leaves the code sets alone", () => {
    storage.setItem(CODE_SETS_KEY, JSON.stringify([["A-1"]]));
    storage.setItem(MARKS_KEY, "{not json");
    expect(getCodesStartedForOthers()).toEqual([]);

    storage.setItem(MARKS_KEY, JSON.stringify([["A-1"], 7]));
    expect(getCodesStartedForOthers()).toEqual([]);

    expect(getStoredCodeSets()).toEqual([["A-1"]]);
  });
});
