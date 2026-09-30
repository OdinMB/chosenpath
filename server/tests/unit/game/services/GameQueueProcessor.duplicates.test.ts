import { beforeEach, afterEach, describe, expect, it, jest } from "@jest/globals";

/*
 * A player's choice or character selection is checked against the stored
 * story (GameHandler), which lags the queue: a copy sent while the first was
 * still queued or running (a second press after a failure, "Try again" beside
 * the game's own controls, two tabs) passes the check and is queued too.
 * Recorded twice, it queued the turn twice: two paid turns, the second
 * written over the first, and a copied character selection stored the
 * selection as not yet complete for a moment. The queue now records each
 * player's choice on a beat, and each player's character, once.
 */

type Story = import("core/models/Story.js").Story;
type PlayerSlot = import("core/types/index.js").PlayerSlot;

let stored: Story | null = null;
const storedVersions: Story[] = [];
const getStory = jest.fn<(gameId: string) => Promise<Story | null>>(async () => stored);
const storeStory = jest.fn<(gameId: string, story: Story) => Promise<void>>(async (_gameId, story) => {
  stored = story;
  storedVersions.push(story);
});
const handleProgression = jest.fn<(gameId: string, story: Story) => Promise<unknown>>();
const processChoice =
  jest.fn<(gameId: string, story: Story, playerSlot: PlayerSlot, optionIndex: number) => Promise<unknown>>();

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
  pregenerationService: {
    triggerPregeneration: jest.fn(async () => undefined),
    markPregenerationComplete: jest.fn(),
    isPregenerationInProgress: jest.fn(),
  },
}));
await mockModule("../../../../src/stories/StoryRepository.js", () => ({
  __esModule: true,
  storyRepository: { getStory, storeStory },
}));
await mockModule("../../../../src/stories/StoryDbService.js", () => ({
  __esModule: true,
  storyDbService: { updatePlayerPendingStatus: jest.fn(async () => undefined) },
}));
await mockModule("../../../../src/game/ConnectionManager.js", () => ({
  __esModule: true,
  connectionManager: { broadcastStoryUpdate: jest.fn() },
}));
await mockModule("../../../../src/shared/storageUtils.js", () => ({
  __esModule: true,
  ensureStoryDirectoryStructure: jest.fn(async () => undefined),
}));

const { GameQueueProcessor } = await import("../../../../src/game/services/GameQueueProcessor.js");
const { createMockStory, createMockMultiplayerStory } = await import("../../../helpers/testHelpers.js");
const { beatGeneration } = await import("../../../helpers/textFixtures.js");
type Processor = InstanceType<typeof GameQueueProcessor>;
type StoryState = import("core/types/index.js").StoryState;
type Beat = import("core/types/index.js").Beat;

/** A played beat: its choice, or -1 while the player has not chosen. */
const beatWith = (choice = -1): Beat => ({ ...beatGeneration(), choice, resolution: null });

async function drained(): Promise<void> {
  for (let i = 0; i < 50; i++) await new Promise((resolve) => setImmediate(resolve));
}

let processor: Processor;
let errors: unknown[];

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => undefined);
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
  jest.spyOn(console, "error").mockImplementation(() => undefined);
  stored = null;
  storedVersions.length = 0;
  getStory.mockClear();
  storeStory.mockClear();
  handleProgression.mockReset();
  handleProgression.mockImplementation(async (_gameId, story) => ({
    finalStory: story,
    requiresPregeneration: false,
    imageRequests: [],
  }));
  processChoice.mockReset();
  // The choice recorded on the story it was queued with, as the service does without a pregeneration
  processChoice.mockImplementation(async (_gameId, story, playerSlot, optionIndex) => {
    const processedStory = story.updateChoice(playerSlot, optionIndex);
    return { processedStory, shouldTriggerProgression: processedStory.areAllChoicesSubmitted(), requiresPregeneration: false };
  });
  processor = new GameQueueProcessor();
  errors = [];
  processor.events.on("operationError", (event: unknown) => errors.push(event));
});

afterEach(async () => {
  await processor.stop();
  jest.restoreAllMocks();
});

/** A single-player story waiting on the player's choice on its second beat. */
function waitingOnChoice(): Story {
  const base = createMockStory({ id: "game-1" });
  const player = base.getState().players.player1!;
  return base.applyChanges({
    players: {
      player1: { ...player, identityChoice: 0, backgroundChoice: 0, beatHistory: [beatWith(1), beatWith()] },
    },
  });
}

/** A story whose characters are being picked: one identity and one background on offer to each player. */
function picking(story: Story): Story {
  const options: StoryState["characterSelectionOptions"] = {};
  for (const slot of story.getPlayerSlots()) {
    options[slot] = {
      outcomes: [],
      possibleCharacterIdentities: [
        {
          name: "Mara",
          pronouns: { personal: "she", object: "her", possessive: "her", reflexive: "herself" },
          appearance: "A sailor with a red scarf.",
        },
      ],
      possibleCharacterBackgrounds: [{ title: "Harbour kid", fluffTemplate: "", initialPlayerStatValues: [] }],
    };
  }
  return story.applyChanges({ id: "game-1", characterSelectionCompleted: false, characterSelectionOptions: options });
}

const choice = (story: Story, playerSlot: PlayerSlot = "player1", optionIndex = 0) =>
  processor.addOperation({ type: "recordChoice", gameId: "game-1", input: { story, playerSlot, optionIndex } });
const selection = (story: Story, playerSlot: PlayerSlot = "player1") =>
  processor.addOperation({
    type: "recordCharacterSelection",
    gameId: "game-1",
    input: { story, playerSlot, identityIndex: 0, backgroundIndex: 0 },
  });

describe("GameQueueProcessor: a copy of a player's choice", () => {
  it("is recorded once: a copy queued while the first was on its way finds the choice stored and queues no second turn", async () => {
    const story = waitingOnChoice();
    stored = story;
    // Both checked against the stored story before either ran, as GameHandler does
    await choice(story, "player1", 0);
    await choice(story, "player1", 2);
    await drained();

    expect(processChoice).toHaveBeenCalledTimes(1);
    expect(handleProgression).toHaveBeenCalledTimes(1);
    expect(stored!.getPlayer("player1")!.beatHistory[1]!.choice).toBe(0);
    expect(errors).toEqual([]);
  });

  it("is recorded when the first send failed before anything was stored", async () => {
    const story = waitingOnChoice();
    stored = story;
    processChoice.mockRejectedValueOnce(new Error("Choice failed"));
    await choice(story);
    await choice(story);
    await drained();

    expect(processChoice).toHaveBeenCalledTimes(2);
    expect(handleProgression).toHaveBeenCalledTimes(1);
  });

  it("never takes another player's stored choice for a copy of this player's", async () => {
    const group = createMockMultiplayerStory(2);
    const players: StoryState["players"] = {};
    for (const [slot, player] of Object.entries(group.getState().players)) {
      players[slot] = { ...player, identityChoice: 0, backgroundChoice: 0, beatHistory: [beatWith()] };
    }
    const story = group.applyChanges({ id: "game-1", players });
    stored = story.updateChoice("player1", 1);

    await choice(stored, "player2", 0);
    await drained();

    expect(processChoice).toHaveBeenCalledTimes(1);
    expect(handleProgression).toHaveBeenCalledTimes(1);
  });
});

describe("GameQueueProcessor: a copy of a player's character selection", () => {
  it("is recorded once: a copy queued while the first was on its way queues no second turn, and the selection is never stored as open again", async () => {
    const story = picking(createMockStory({ id: "game-1" }));
    stored = story;
    await selection(story);
    await selection(story);
    await drained();

    expect(handleProgression).toHaveBeenCalledTimes(1);
    const completedAt = storedVersions.findIndex((version) => version.getState().characterSelectionCompleted);
    expect(completedAt).toBeGreaterThan(-1);
    expect(storedVersions.slice(completedAt).every((version) => version.getState().characterSelectionCompleted)).toBe(true);
    expect(errors).toEqual([]);
  });

  it("is a copy once this player's character is stored, even before the others have picked", async () => {
    const story = picking(createMockMultiplayerStory(2));
    stored = story;
    await selection(story, "player1");
    await selection(story, "player1");
    await drained();

    // The first selection's store only; the copy stores nothing
    expect(storeStory).toHaveBeenCalledTimes(1);
    expect(handleProgression).not.toHaveBeenCalled();
  });
});
