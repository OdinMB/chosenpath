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
const storeStory = jest.fn<(...args: unknown[]) => Promise<void>>(async () => undefined);
const broadcastStoryUpdate = jest.fn();
const triggerPregeneration = jest.fn<(...args: unknown[]) => Promise<void>>(async () => undefined);

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
  pregenerationService: { triggerPregeneration, markPregenerationComplete: jest.fn(), isPregenerationInProgress: jest.fn() },
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
  storeStory.mockReset();
  storeStory.mockImplementation(async () => undefined);
  broadcastStoryUpdate.mockClear();
  triggerPregeneration.mockReset();
  triggerPregeneration.mockImplementation(async () => undefined);
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

  it("never writes a turn again once storing it has begun: a failure storing or sending it is reported, not resent", async () => {
    handleProgression.mockResolvedValue(progressed());
    storeStory.mockRejectedValue(new Error("disk full"));
    await processor.addOperation({ type: "moveStoryForward", gameId: "game-1", input: { story: story() } });
    await drained();

    expect(handleProgression).toHaveBeenCalledTimes(1);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ operationType: "moveStoryForward" });
  });

  it("neither fails nor resends a turn that was stored and sent when its pregeneration can't start", async () => {
    handleProgression.mockResolvedValue({ ...progressed(), requiresPregeneration: true });
    triggerPregeneration.mockRejectedValue(new Error("pregeneration failed"));
    await processor.addOperation({ type: "moveStoryForward", gameId: "game-1", input: { story: story() } });
    await drained();

    expect(handleProgression).toHaveBeenCalledTimes(1);
    expect(storeStory).toHaveBeenCalledTimes(1);
    expect(errors).toEqual([]);
  });

  it("counts a turn as on its way through both its sends, and not once its last send has failed", async () => {
    const whileWriting: boolean[] = [];
    handleProgression.mockImplementation(async () => {
      whileWriting.push(processor.isTurnOnItsWay("game-1"));
      throw new Error("Failed to generate next beats. Please try again.");
    });
    const whenReported: boolean[] = [];
    processor.events.on("operationError", () => whenReported.push(processor.isTurnOnItsWay("game-1")));
    await processor.addOperation({ type: "moveStoryForward", gameId: "game-1", input: { story: story() } });
    await drained();

    expect(whileWriting).toEqual([true, true]);
    expect(whenReported).toEqual([false]);
    expect(processor.isTurnOnItsWay("game-1")).toBe(false);
  });

  it("counts a choice or character selection being recorded as a turn on its way, since it queues the turn", async () => {
    processChoice.mockRejectedValue(new Error("Choice failed"));
    // Checked as soon as each is queued: both fail here (a mock choice, a story without character options)
    void processor.addOperation({ type: "recordChoice", gameId: "game-1", input: { story: story(), playerSlot: "player1", optionIndex: 0 } });
    expect(processor.isTurnOnItsWay("game-1")).toBe(true);
    void processor.addOperation({
      type: "recordCharacterSelection",
      gameId: "game-2",
      input: { story: story(), playerSlot: "player1", identityIndex: 0, backgroundIndex: 0 },
    });
    expect(processor.isTurnOnItsWay("game-2")).toBe(true);

    await drained();
    expect(processor.isTurnOnItsWay("game-1")).toBe(false);
    expect(processor.isTurnOnItsWay("game-2")).toBe(false);
  });

  it("never counts an image outcome as a turn on its way", async () => {
    // Checked while it is still queued
    void processor.addOperation({ type: "attachImageToStory", gameId: "game-1", input: { imageId: "beat-1", caption: "" } });

    expect(processor.isTurnOnItsWay("game-1")).toBe(false);
    await drained();
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
