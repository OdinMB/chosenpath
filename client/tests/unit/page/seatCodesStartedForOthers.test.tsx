import type {
  CreateStoryFromTemplateRequest,
  CreateStoryInfo,
} from "core/types/api";
import type { PublicUser } from "core/types/user";
import { useMultiStoryCreation } from "../../../src/page/hooks/useMultiStoryCreation";
import { useStoryCreation } from "../../../src/page/hooks/useStoryCreation";
import { storyApi } from "../../../src/shared/apiClient";
import { authApi } from "../../../src/shared/auth/authApi";
import { notificationService } from "../../../src/shared/notifications/notificationService";
import {
  getCodesStartedForOthers,
  getStoredCodeSets,
} from "../../../src/shared/utils/codeSetUtils";
import { renderMarkup } from "../../helpers/staticMarkup";

/*
 * What a start keeps on this device. "Start several stories at once" stores
 * each story's seat codes, so the stories show on the home page and My
 * Stories, and marks them as started for other players. A single start
 * stores its codes unmarked, as before. A several-stories start first asks
 * the server who is signed in: stories started without a sign-in would
 * belong to no account, so a lapsed sign-in starts nothing and asks the
 * person to sign in again.
 */

// The real config reads import.meta.env, which Jest cannot parse
jest.mock("../../../src/config", () =>
  jest.requireActual("../../__mocks__/client/config")
);
jest.mock("../../../src/shared/apiClient", () => ({
  storyApi: { createStoryFromTemplate: jest.fn() },
}));
jest.mock("../../../src/shared/auth/authApi", () => ({
  authApi: { getCurrentUser: jest.fn() },
}));
jest.mock("../../../src/shared/notifications/notificationService", () => ({
  notificationService: { addNotification: jest.fn() },
}));
const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
}));

const SIGNED_IN: PublicUser = {
  id: "user-1",
  username: "someone",
  email: "someone@example.com",
  roleId: "role_user",
  createdAt: 1,
  lastLoginAt: null,
  permissions: [],
};

const SETTINGS: CreateStoryFromTemplateRequest = {
  templateId: "template-1",
  playerCount: 2,
  maxTurns: 10,
  generateImages: false,
  pregenerateBeats: false,
  difficultyLevel: { modifier: 0, title: "Normal" },
};

function started(storyId: string): CreateStoryInfo {
  return {
    storyId,
    codes: { player1: `${storyId}-SEAT-1`, player2: `${storyId}-SEAT-2` },
    status: "ready",
  };
}

/** The hook's value from one render; its callbacks are what a click would call. */
function hookValue<T>(useHook: () => T): T {
  const values: T[] = [];
  function Probe() {
    values.push(useHook());
    return null;
  }
  renderMarkup(<Probe />);
  return values[values.length - 1]!;
}

/** This device's storage, kept in memory. */
function deviceStorage() {
  const items = new Map<string, string>();
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: jest.fn((key: string, value: string) => {
      items.set(key, value);
    }),
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
  jest.spyOn(console, "info").mockImplementation(() => undefined);
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
  storageBefore = global.localStorage;
  storage = deviceStorage();
  global.localStorage = storage;
  mockNavigate.mockClear();
  jest.mocked(storyApi.createStoryFromTemplate).mockReset();
  jest.mocked(authApi.getCurrentUser).mockReset();
  jest.mocked(notificationService.addNotification).mockClear();
});

afterEach(() => {
  global.localStorage = storageBefore;
  jest.restoreAllMocks();
});

describe("Start several stories at once: seat codes on this device", () => {
  it("stores each story's codes, marked as started for other players, and opens their seat cards", async () => {
    jest.mocked(authApi.getCurrentUser).mockResolvedValue(SIGNED_IN);
    jest
      .mocked(storyApi.createStoryFromTemplate)
      .mockResolvedValueOnce(started("story-1"))
      .mockResolvedValueOnce(started("story-2"));

    const outcome = await hookValue(useMultiStoryCreation).startStories(SETTINGS, 2);

    expect(outcome).toBe("started");
    expect(getStoredCodeSets()).toEqual([
      ["story-1-SEAT-1", "story-1-SEAT-2"],
      ["story-2-SEAT-1", "story-2-SEAT-2"],
    ]);
    expect(getCodesStartedForOthers()).toEqual([
      "story-1-SEAT-1",
      "story-1-SEAT-2",
      "story-2-SEAT-1",
      "story-2-SEAT-2",
    ]);
    expect(mockNavigate).toHaveBeenCalledWith(
      "/users/seat-cards?stories=story-1,story-2"
    );
  });

  it("leaves the codes an earlier start stored as they were, unmarked", async () => {
    storage.setItem("playerCodeSets", JSON.stringify([["OLD-1", "OLD-2"]]));
    jest.mocked(authApi.getCurrentUser).mockResolvedValue(SIGNED_IN);
    jest
      .mocked(storyApi.createStoryFromTemplate)
      .mockResolvedValueOnce(started("story-1"))
      .mockRejectedValueOnce({ status: "rate_limited" });

    await hookValue(useMultiStoryCreation).startStories(SETTINGS, 2);

    expect(getStoredCodeSets()).toEqual([
      ["OLD-1", "OLD-2"],
      ["story-1-SEAT-1", "story-1-SEAT-2"],
    ]);
    expect(getCodesStartedForOthers()).toEqual(["story-1-SEAT-1", "story-1-SEAT-2"]);
  });
});

describe("Start several stories at once: a sign-in that has lapsed", () => {
  it("starts nothing, stores nothing and says the sign-in lapsed, for the form to ask again", async () => {
    jest.mocked(authApi.getCurrentUser).mockResolvedValue(null);

    const outcome = await hookValue(useMultiStoryCreation).startStories(SETTINGS, 3);

    expect(outcome).toBe("signed-out");
    expect(storyApi.createStoryFromTemplate).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("starts nothing when the check itself fails, which the API client has announced", async () => {
    jest.mocked(authApi.getCurrentUser).mockRejectedValue(new Error("Network Error"));

    const outcome = await hookValue(useMultiStoryCreation).startStories(SETTINGS, 3);

    expect(outcome).toBe("not-started");
    expect(storyApi.createStoryFromTemplate).not.toHaveBeenCalled();
    expect(notificationService.addNotification).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

describe("Start several stories at once: the account's starts left", () => {
  it("checks the sign-in, then starts no more stories than are left, each marked", async () => {
    jest.mocked(authApi.getCurrentUser).mockResolvedValue(SIGNED_IN);
    jest
      .mocked(storyApi.createStoryFromTemplate)
      .mockResolvedValueOnce(started("story-1"))
      .mockResolvedValueOnce(started("story-2"));

    const outcome = await hookValue(useMultiStoryCreation).startStories(SETTINGS, 5, 2);

    expect(outcome).toBe("started");
    expect(authApi.getCurrentUser).toHaveBeenCalledTimes(1);
    expect(storyApi.createStoryFromTemplate).toHaveBeenCalledTimes(2);
    expect(getCodesStartedForOthers()).toEqual([
      "story-1-SEAT-1",
      "story-1-SEAT-2",
      "story-2-SEAT-1",
      "story-2-SEAT-2",
    ]);
    // All that could start did, so no "not every story started" warning
    expect(notificationService.addNotification).not.toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith(
      "/users/seat-cards?stories=story-1,story-2"
    );
  });

  it("starts nothing with no starts left, for the form to read them again", async () => {
    jest.mocked(authApi.getCurrentUser).mockResolvedValue(SIGNED_IN);

    const outcome = await hookValue(useMultiStoryCreation).startStories(SETTINGS, 3, 0);

    expect(outcome).toBe("not-started");
    expect(storyApi.createStoryFromTemplate).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

describe("A single start: seat codes on this device", () => {
  it("stores the story's codes unmarked, as before", async () => {
    jest
      .mocked(storyApi.createStoryFromTemplate)
      .mockResolvedValueOnce(started("story-1"));

    await hookValue(useStoryCreation).createStoryFromTemplate(SETTINGS);

    expect(getStoredCodeSets()).toEqual([["story-1-SEAT-1", "story-1-SEAT-2"]]);
    expect(getCodesStartedForOthers()).toEqual([]);
    expect(authApi.getCurrentUser).not.toHaveBeenCalled();
  });
});
