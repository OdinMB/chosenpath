import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";

/*
 * A turn that fails (a plan unusable twice, a call that failed through its
 * own re-sends) is sent once more through the queue's failure path before the
 * players are told it failed. Found by the playthroughs of 2026-09-30: the
 * failure path reported it and nothing ever sent it again, so the players
 * were stuck at that turn for good. A choice is never sent again.
 */

type Progression = (gameId: string, story: unknown) => Promise<unknown>;
const handleProgression = jest.fn<Progression>();
const processChoice = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const storeStory = jest.fn(async () => undefined);
const broadcastStoryUpdate = jest.fn();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockModule = (jest as any).unstable_mockModule;
await mockModule("../../../../src/images/AIImageGenerator.js", () => ({
  __esModule: true,
  AIImageGenerator: class {
    generateBeatImage = jest.fn();
  },
}));
await mockModule("../../../../src/game/services/StoryProgressionService.js", () => ({
  __esModule: true,
  storyProgressionService: { handleProgression },
}));
await mockModule("../../../../src/game/services/ChoiceProcessingService.js", () => ({
  __esModule: true,
  choiceProcessingService: { processChoice },
}));
await mockModule("../../../../src/game/services/PregenerationService.js", () => ({
  __esModule: true,
  pregenerationService: { triggerPregeneration: jest.fn(), markPregenerationComplete: jest.fn(), isPregenerationInProgress: jest.fn() },
}));
await mockModule("../../../../src/stories/StoryRepository.js", () => ({
  __esModule: true,
  storyRepository: { getStory: jest.fn(async () => null), storeStory },
}));
await mockModule("../../../../src/stories/StoryDbService.js", () => ({
  __esModule: true,
  storyDbService: { updatePlayerPendingStatus: jest.fn() },
}));
await mockModule("../../../../src/game/ConnectionManager.js", () => ({
  __esModule: true,
  connectionManager: { broadcastStoryUpdate },
}));
await mockModule("../../../../src/shared/storageUtils.js", () => ({
  __esModule: true,
  ensureStoryDirectoryStructure: jest.fn(async () => undefined),
}));

const { GameQueueProcessor } = await import("../../../../src/game/services/GameQueueProcessor.js");
const { createMockStory } = await import("../../../helpers/testHelpers.js");
type OperationErrorEvent = import("../../../../src/game/queue.js").OperationErrorEvent;
type Processor = InstanceType<typeof GameQueueProcessor>;

async function drained(): Promise<void> {
  for (let i = 0; i < 50; i++) await new Promise((resolve) => setImmediate(resolve));
}

let processor: Processor;
let errors: OperationErrorEvent[];

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => undefined);
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
  jest.spyOn(console, "error").mockImplementation(() => undefined);
  handleProgression.mockReset();
  processChoice.mockReset();
  storeStory.mockClear();
  broadcastStoryUpdate.mockClear();
  processor = new GameQueueProcessor();
  errors = [];
  processor.events.on("operationError", (event: OperationErrorEvent) => errors.push(event));
});

afterEach(async () => {
  await processor.stop();
  jest.restoreAllMocks();
});

const story = () => createMockStory({ id: "game-1" });
const progressed = () => ({ finalStory: createMockStory({ id: "game-1" }), requiresPregeneration: false, imageRequests: [] });

describe("GameQueueProcessor: a failed turn", () => {
  it("stores and broadcasts the second send's story, and tells the players nothing failed", async () => {
    handleProgression.mockRejectedValueOnce(new Error("Failed to generate a usable thread plan")).mockResolvedValueOnce(progressed());
    const input = story();
    await processor.addOperation({ type: "moveStoryForward", gameId: "game-1", input: { story: input } });
    await drained();

    expect(handleProgression).toHaveBeenCalledTimes(2);
    expect(handleProgression.mock.calls.map((call) => call[1])).toEqual([input, input]);
    expect(storeStory).toHaveBeenCalledTimes(1);
    expect(broadcastStoryUpdate).toHaveBeenCalledTimes(1);
    expect(errors).toEqual([]);
  });

  it("reports a turn that fails on both sends once, and never sends it a third time", async () => {
    handleProgression.mockRejectedValue(new Error("Failed to generate next beats. Please try again."));
    await processor.addOperation({ type: "moveStoryForward", gameId: "game-1", input: { story: story() } });
    await drained();

    expect(handleProgression).toHaveBeenCalledTimes(2);
    expect(storeStory).not.toHaveBeenCalled();
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ gameId: "game-1", operationType: "moveStoryForward" });
  });

  it("never sends a failed choice again", async () => {
    processChoice.mockRejectedValue(new Error("Choice failed"));
    await processor.addOperation({ type: "recordChoice", gameId: "game-1", input: { story: story(), playerSlot: "player1", optionIndex: 0 } });
    await drained();

    expect(processChoice).toHaveBeenCalledTimes(1);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ operationType: "recordChoice" });
  });
});
