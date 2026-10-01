import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { Response } from "express";
import type { StoryState } from "core/types/index.js";
import { GameModes, ResponseStatus } from "core/types/index.js";
import { createMockStoryState } from "../../helpers/testHelpers.js";
import { outcome, stat } from "../../helpers/textFixtures.js";

// Everything around the setup is stubbed: no model call, no DB, no files
const createInitialState = jest.fn<(...args: unknown[]) => Promise<StoryState>>();
const isAppropriatePrompt = jest.fn<(prompt: string) => Promise<{ isAppropriate: boolean; reason?: string }>>();
const storeStory = jest.fn<(...args: unknown[]) => Promise<void>>(async () => undefined);
const getStory = jest.fn<(storyId: string) => Promise<unknown>>();
const deleteStoryWithPlayers = jest.fn<(...args: unknown[]) => Promise<void>>(async () => undefined);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockModule = (jest as any).unstable_mockModule;
await mockModule("../../../src/game/services/AIStoryGenerator.js", () => ({
  __esModule: true,
  AIStoryGenerator: class {
    createInitialState = createInitialState;
  },
}));
await mockModule("../../../src/game/services/ContentFilterService.js", () => ({
  __esModule: true,
  ContentFilterService: class {
    isAppropriatePrompt = isAppropriatePrompt;
  },
}));
await mockModule("../../../src/images/AIImageGenerator.js", () => ({
  __esModule: true,
  AIImageGenerator: class {},
}));
await mockModule("../../../src/templates/TemplateService.js", () => ({
  __esModule: true,
  TemplateService: class {},
}));
await mockModule("../../../src/game/ConnectionManager.js", () => ({
  __esModule: true,
  connectionManager: { createGameSession: jest.fn(), registerCode: jest.fn() },
}));
await mockModule("../../../src/shared/storageUtils.js", () => ({
  __esModule: true,
  ensureStoryDirectoryStructure: jest.fn(async () => undefined),
  loadTemplateImages: jest.fn(() => []),
}));
await mockModule("../../../src/stories/StoryRepository.js", () => ({
  __esModule: true,
  storyRepository: { storeStory, getStory },
}));
await mockModule("../../../src/stories/StoryDbService.js", () => ({
  __esModule: true,
  storyDbService: {
    createStoryEntry: jest.fn(async () => undefined),
    bulkCreateStoryPlayerEntries: jest.fn(async () => undefined),
    updateStoryGeneratedDetails: jest.fn(async () => undefined),
    deleteStoryWithPlayers,
  },
}));
await mockModule("../../../src/shared/db.js", () => ({
  __esModule: true,
  getDb: () => ({ query: jest.fn(async () => undefined) }),
}));
await mockModule("../../../src/config.js", () => ({
  __esModule: true,
  IMAGE_GENERATION_STORY_COVER_QUALITY: "low",
}));
await mockModule("../../../src/game/services/GameQueueProcessor.js", () => ({
  __esModule: true,
  gameQueueProcessor: { addOperation: jest.fn() },
}));
await mockModule("../../../src/game/services/StoryImageJobs.js", () => ({
  __esModule: true,
  startBackgroundImageGeneration: jest.fn(),
}));

const { StoryCreationService } = await import("../../../src/stories/StoryCreationService.js");

const PREMISE = "A lighthouse keeper named Ottoline Brandvik hides a letter";

type Sent = { statusCode: number; body: { status: string; data?: { storyId: string; status: string } } };

function fakeResponse(): { res: Response; sent: Sent[] } {
  const sent: Sent[] = [];
  const res = {
    req: { originalUrl: "/api/stories" },
    status(statusCode: number) {
      return {
        json(body: Sent["body"]) {
          sent.push({ statusCode, body });
        },
      };
    },
  } as unknown as Response;
  return { res, sent };
}

async function create(service: InstanceType<typeof StoryCreationService>): Promise<{ storyId: string; sent: Sent[] }> {
  const { res, sent } = fakeResponse();
  await service.createStory(PREMISE, false, false, 1, 10, GameModes.Cooperative, undefined, res);
  // Let the background setup run to its end
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  return { storyId: sent[0]?.body.data?.storyId ?? "", sent };
}

function startableState(overrides: Partial<StoryState> = {}): StoryState {
  return createMockStoryState({ sharedOutcomes: [outcome("shared_letter_found")], ...overrides });
}

let logs: string[];
beforeEach(() => {
  jest.clearAllMocks();
  logs = [];
  const capture = (...args: unknown[]) => {
    logs.push(args.map((arg) => (arg instanceof Error ? `${arg.message} ${arg.stack}` : String(arg))).join(" "));
  };
  jest.spyOn(console, "log").mockImplementation(capture);
  jest.spyOn(console, "warn").mockImplementation(capture);
  jest.spyOn(console, "error").mockImplementation(capture);
  isAppropriatePrompt.mockResolvedValue({ isAppropriate: true });
  getStory.mockResolvedValue(null);
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe("StoryCreationService setup status", () => {
  it("marks a story whose setup fails for good as failed, and cleans up its DB entries", async () => {
    createInitialState.mockRejectedValue(new Error(`model gave up on: ${PREMISE}`));
    const service = new StoryCreationService();

    const { storyId, sent } = await create(service);

    expect(sent[0]?.body.data?.status).toBe("queued");
    expect(await service.checkStoryStatus(storyId)).toEqual({ status: "failed", reason: "setup_failed" });
    expect(deleteStoryWithPlayers).toHaveBeenCalledWith(storyId);
  });

  it("logs the failure with the story id and no premise text or error detail", async () => {
    createInitialState.mockRejectedValue(new Error(`model gave up on: ${PREMISE}`));
    const service = new StoryCreationService();

    const logsBefore = () => logs.length;
    const { res } = fakeResponse();
    const from = logsBefore();
    await service.createStory(PREMISE, false, false, 1, 10, GameModes.Cooperative, undefined, res);
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    const setupLines = logs.slice(from);
    const failureLines = setupLines.filter((line) => /fail/i.test(line));
    expect(failureLines.length).toBeGreaterThan(0);
    expect(setupLines.some((line) => line.includes("Ottoline") || line.includes("model gave up"))).toBe(false);
  });

  it("logs the request with the story id and the premise's length, never its text", async () => {
    createInitialState.mockResolvedValue(startableState());
    const service = new StoryCreationService();

    const { storyId } = await create(service);

    const startLines = logs.filter((line) => line.includes(`premise of ${PREMISE.length} characters`));
    expect(startLines).toHaveLength(1);
    expect(startLines[0]).toContain(storyId);
    expect(logs.some((line) => line.includes("Ottoline") || line.includes("lighthouse"))).toBe(false);
  });

  it("logs a refused premise without its text", async () => {
    isAppropriatePrompt.mockResolvedValue({ isAppropriate: false, reason: "Violence" });
    const service = new StoryCreationService();

    await create(service);

    expect(logs.some((line) => line.includes(`premise of ${PREMISE.length} characters`))).toBe(true);
    expect(logs.some((line) => line.includes("Ottoline") || line.includes("lighthouse"))).toBe(false);
  });

  it("keeps a story that is still being set up queued", async () => {
    createInitialState.mockReturnValue(new Promise<StoryState>(() => undefined));
    const service = new StoryCreationService();

    const { storyId } = await create(service);

    expect(await service.checkStoryStatus(storyId)).toEqual({ status: "queued" });
  });

  it("reports a stored story as ready", async () => {
    createInitialState.mockResolvedValue(startableState());
    const service = new StoryCreationService();

    const { storyId } = await create(service);
    expect(storeStory).toHaveBeenCalledTimes(1);
    getStory.mockResolvedValue({});

    expect(await service.checkStoryStatus(storyId)).toEqual({ status: "ready" });
  });

  it("reports a story this server isn't setting up and never stored as failed, so the client stops waiting", async () => {
    const service = new StoryCreationService();

    expect(await service.checkStoryStatus("story-from-before-a-restart")).toEqual({
      status: "failed",
      reason: "setup_lost",
    });
  });

  it.each([
    ["read-with-kids", true],
    ["enjoy-fiction", false],
    [undefined, false],
  ] as const)("asks the setup for the kids stat budget when the category is %s: %s", async (category, kids) => {
    createInitialState.mockResolvedValue(startableState());
    const service = new StoryCreationService();
    const { res } = fakeResponse();

    await service.createStory(PREMISE, false, false, 2, 20, GameModes.Cooperative, undefined, res, undefined, category);
    await new Promise((resolve) => setImmediate(resolve));

    expect(createInitialState).toHaveBeenCalledTimes(1);
    const args = createInitialState.mock.calls[0];
    // The story's length and players reach the setup too, since the outcome slate is sized by them
    expect(args.slice(3, 6)).toEqual([2, 20, GameModes.Cooperative]);
    expect(args[7]).toEqual({ kids });
  });

  it.each([
    ["read-with-kids", "How old is the child?: 5", "5"],
    ["read-with-kids", "A mouse story with no age", undefined],
    ["enjoy-fiction", "How old is the child?: 5", undefined],
  ] as const)("records the story's category and, read with a child, the age its premise states (%s, %s)", async (category, premise, age) => {
    createInitialState.mockResolvedValue(startableState());
    const service = new StoryCreationService();
    const { res } = fakeResponse();

    await service.createStory(`Create an age-appropriate story.\n\n${premise}`, false, false, 1, 10, GameModes.Cooperative, undefined, res, undefined, category);
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    const stored = storeStory.mock.calls[0]?.[1] as { getState(): StoryState } | undefined;
    expect(stored?.getState().category).toBe(category);
    expect(stored?.getState().readingAge).toBe(age);
  });

  it("answers a content-filter refusal with its moderation response and starts no setup", async () => {
    isAppropriatePrompt.mockResolvedValue({ isAppropriate: false, reason: "Violence" });
    const service = new StoryCreationService();

    const { sent } = await create(service);

    expect(sent).toEqual([
      expect.objectContaining({ statusCode: 400, body: expect.objectContaining({ status: ResponseStatus.MODERATION_BLOCKED }) }),
    ]);
    expect(createInitialState).not.toHaveBeenCalled();
  });

  it("stores a generated setup with each background value read by its stat's type", async () => {
    createInitialState.mockResolvedValue(
      startableState({
        playerStats: [stat("player_nerve", { partOfPlayerBackgrounds: true, initialValue: 40 })],
        characterSelectionOptions: {
          player1: {
            outcomes: [],
            possibleCharacterIdentities: [],
            possibleCharacterBackgrounds: [
              {
                title: "Keeper",
                fluffTemplate: "{name} keeps the light.",
                initialPlayerStatValues: [
                  { statId: "player_nerve", value: "65%" },
                  { statId: "shared_weather", value: "Storm" },
                ],
              },
            ],
          },
        },
      })
    );
    const service = new StoryCreationService();

    const { storyId } = await create(service);

    const stored = storeStory.mock.calls[0]?.[1] as { getState(): StoryState } | undefined;
    expect(
      stored?.getState().characterSelectionOptions.player1?.possibleCharacterBackgrounds[0]?.initialPlayerStatValues
    ).toEqual([{ statId: "player_nerve", value: 65 }]);
    const checked = logs.filter((line) => line.includes("1 converted, 1 dropped"));
    expect(checked).toHaveLength(1);
    expect(checked[0]).toContain(storyId);
    expect(checked[0]).not.toContain("player_nerve");
  });
});
