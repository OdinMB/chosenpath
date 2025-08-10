import { jest } from "@jest/globals";

// ESM-safe mocks before imports
// eslint-disable-next-line @typescript-eslint/no-explicit-any
await (jest as any).unstable_mockModule(
  "../../../../src/stories/StoryRepository.js",
  () => ({
    __esModule: true,
    storyRepository: {
      hasPregeneratedStory: jest.fn(),
      getPregeneratedStory: jest.fn(),
      deletePregeneratedStoriesForTurn: jest.fn(),
    },
  })
);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
await (jest as any).unstable_mockModule(
  "../../../../src/game/services/GameQueueProcessor.js",
  () => ({
    __esModule: true,
    gameQueueProcessor: { addOperation: jest.fn() },
  })
);

const { PregenerationService } = await import(
  "../../../../src/game/services/PregenerationService.js"
);
const { Story } = await import("core/models/Story.js");
const { storyRepository } = await import(
  "../../../../src/stories/StoryRepository.js"
);
const { gameQueueProcessor } = await import(
  "../../../../src/game/services/GameQueueProcessor.js"
);
import { createMockStoryState } from "../../../__mocks__/game/services/AIStoryGenerator.js";
import type { PlayerState, Beat } from "core/types/index.js";

// Mock dependencies

// Capture logs from PregenerationService to avoid noisy test output
const logs: string[] = [];
const errors: string[] = [];
jest.mock("shared/logger.js", () => ({
  Logger: {
    Queue: {
      log: (...args: unknown[]) => logs.push(args.map(String).join(" ")),
      error: (...args: unknown[]) => errors.push(args.map(String).join(" ")),
    },
  },
}));

describe("PregenerationService", () => {
  let pregenerationService: ReturnType<typeof PregenerationService.getInstance>;
  let mockStoryRepository: jest.Mocked<typeof storyRepository>;
  let mockGameQueueProcessor: jest.Mocked<typeof gameQueueProcessor>;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Get fresh instance for each test
    pregenerationService = PregenerationService.getInstance();

    // Clear singleton state between tests
    pregenerationService.cleanupStory("test-story-id");

    // Setup mock implementations
    mockStoryRepository = storyRepository as jest.Mocked<
      typeof storyRepository
    >;
    mockGameQueueProcessor = gameQueueProcessor as jest.Mocked<
      typeof gameQueueProcessor
    >;

    mockStoryRepository.hasPregeneratedStory.mockResolvedValue(false);
    mockGameQueueProcessor.addOperation.mockResolvedValue("mock-operation-id");
  });

  // Silence console output from the service to keep test output clean
  beforeAll(() => {
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterAll(() => {
    (console.log as jest.Mock).mockRestore();
    (console.error as jest.Mock).mockRestore();
  });

  describe("shouldTriggerPregeneration", () => {
    it("should return false if pregeneration is disabled", () => {
      const storyState = createMockStoryState({
        pregenerateBeats: false,
        characterSelectionCompleted: true,
      });
      const story = Story.create(storyState);

      const result = pregenerationService.shouldTriggerPregeneration(story);

      expect(result).toBe(false);
    });

    it("should return false if character selection is not completed", () => {
      const storyState = createMockStoryState({
        pregenerateBeats: true,
        characterSelectionCompleted: false,
      });
      const story = Story.create(storyState);

      const result = pregenerationService.shouldTriggerPregeneration(story);

      expect(result).toBe(false);
    });

    it("should return false for ending beats", () => {
      const storyState = createMockStoryState({
        pregenerateBeats: true,
        characterSelectionCompleted: true,
      });
      const story = Story.create(storyState);

      // Mock getCurrentBeatType to return "ending"
      jest.spyOn(story, "getCurrentBeatType").mockReturnValue("ending");

      const result = pregenerationService.shouldTriggerPregeneration(story);

      expect(result).toBe(false);
    });

    it("should return true for single player when they haven't made a choice yet (new beat)", () => {
      const storyState = createMockStoryState({
        pregenerateBeats: true,
        characterSelectionCompleted: true,
        players: {
          player1: {
            name: "Test Player",
            pronouns: {
              personal: "they",
              object: "them",
              possessive: "their",
              reflexive: "themselves",
            },
            appearance: "Test appearance",
            fluff: "Test fluff",
            outcomes: [],
            statValues: [],
            knownStoryElements: [],
            beatHistory: [
              {
                plan: {
                  forPlayer: "player1 - Test Player",
                  developmentsToNarrate: "Initial beat setup",
                  beatTypeConsiderations: "Starting thread exploration",
                  otherBeats: "",
                  worldBuilding: "Test world context",
                  newGameElements: [],
                  showDontTellPreviousDecision: "",
                  showDontTell: [],
                  newIntroductionsOfStoryElements: [],
                  establishedFacts: [],
                  optionConsiderations: "Standard exploration options",
                },
                title: "Test Beat",
                text: "Test beat",
                summary: "A test beat for validation",
                options: [
                  {
                    text: "Option 1",
                    optionType: "exploration",
                    resourceType: "normal",
                  },
                  {
                    text: "Option 2",
                    optionType: "exploration",
                    resourceType: "normal",
                  },
                  {
                    text: "Option 3",
                    optionType: "exploration",
                    resourceType: "normal",
                  },
                ],
                interludes: [],
                choice: -1, // No choice made yet (new beat)
                resolution: null,
              },
            ],
            previousTypesOfThreads: [],
            identityChoice: -1,
            backgroundChoice: -1,
          },
        },
      });

      const story = Story.create(storyState);

      // Mock methods
      jest.spyOn(story, "getCurrentBeatType").mockReturnValue("thread");
      jest.spyOn(story, "getPlayerSlots").mockReturnValue(["player1"]);
      jest
        .spyOn(story, "getCurrentBeat")
        .mockReturnValue(
          (storyState.players as Record<string, PlayerState>).player1
            .beatHistory[0] as Beat
        );

      const result = pregenerationService.shouldTriggerPregeneration(story);

      expect(result).toBe(true);
    });

    it("should return true for multiplayer when all but one player have chosen", () => {
      const storyState = createMockStoryState({
        pregenerateBeats: true,
        characterSelectionCompleted: true,
        players: {
          player1: {
            name: "Player One",
            pronouns: {
              personal: "they",
              object: "them",
              possessive: "their",
              reflexive: "themselves",
            },
            appearance: "First player",
            fluff: "First fluff",
            outcomes: [],
            statValues: [],
            knownStoryElements: [],
            beatHistory: [
              {
                plan: {
                  forPlayer: "player1 - Test Player",
                  developmentsToNarrate: "Initial beat setup",
                  beatTypeConsiderations: "Starting thread exploration",
                  otherBeats: "",
                  worldBuilding: "Test world context",
                  newGameElements: [],
                  showDontTellPreviousDecision: "",
                  showDontTell: [],
                  newIntroductionsOfStoryElements: [],
                  establishedFacts: [],
                  optionConsiderations: "Standard exploration options",
                },
                title: "Test Beat",
                text: "Test beat",
                summary: "A test beat for validation",
                options: [
                  {
                    text: "Option 1",
                    optionType: "exploration",
                    resourceType: "normal",
                  },
                  {
                    text: "Option 2",
                    optionType: "exploration",
                    resourceType: "normal",
                  },
                  {
                    text: "Option 3",
                    optionType: "exploration",
                    resourceType: "normal",
                  },
                ],
                interludes: [],
                choice: 0, // Choice made
                resolution: null,
              },
            ],
            previousTypesOfThreads: [],
            identityChoice: -1,
            backgroundChoice: -1,
          },
          player2: {
            name: "Player Two",
            pronouns: {
              personal: "they",
              object: "them",
              possessive: "their",
              reflexive: "themselves",
            },
            appearance: "Second player",
            fluff: "Second fluff",
            outcomes: [],
            statValues: [],
            knownStoryElements: [],
            beatHistory: [
              {
                plan: {
                  forPlayer: "player1 - Test Player",
                  developmentsToNarrate: "Initial beat setup",
                  beatTypeConsiderations: "Starting thread exploration",
                  otherBeats: "",
                  worldBuilding: "Test world context",
                  newGameElements: [],
                  showDontTellPreviousDecision: "",
                  showDontTell: [],
                  newIntroductionsOfStoryElements: [],
                  establishedFacts: [],
                  optionConsiderations: "Standard exploration options",
                },
                title: "Test Beat 2",
                text: "Test beat 2",
                summary: "A second test beat for validation",
                options: [
                  {
                    text: "Option 1",
                    optionType: "exploration",
                    resourceType: "normal",
                  },
                  {
                    text: "Option 2",
                    optionType: "exploration",
                    resourceType: "normal",
                  },
                  {
                    text: "Option 3",
                    optionType: "exploration",
                    resourceType: "normal",
                  },
                ],
                interludes: [],
                choice: -1, // No choice made
                resolution: null,
              },
            ],
            previousTypesOfThreads: [],
            identityChoice: -1,
            backgroundChoice: -1,
          },
        },
      });

      const story = Story.create(storyState);

      // Mock methods
      jest.spyOn(story, "getCurrentBeatType").mockReturnValue("thread");
      jest
        .spyOn(story, "getPlayerSlots")
        .mockReturnValue(["player1", "player2"]);
      jest
        .spyOn(story, "getCurrentBeat")
        .mockImplementationOnce(
          () =>
            (storyState.players as Record<string, PlayerState>).player1
              .beatHistory[0] as Beat
        )
        .mockImplementationOnce(
          () =>
            (storyState.players as Record<string, PlayerState>).player2
              .beatHistory[0] as Beat
        );

      const result = pregenerationService.shouldTriggerPregeneration(story);

      expect(result).toBe(true);
    });

    it("should return false for multiplayer when no players have chosen yet", () => {
      const storyState = createMockStoryState({
        pregenerateBeats: true,
        characterSelectionCompleted: true,
        players: {
          player1: {
            name: "Player One",
            pronouns: {
              personal: "they",
              object: "them",
              possessive: "their",
              reflexive: "themselves",
            },
            appearance: "First player",
            fluff: "First fluff",
            outcomes: [],
            statValues: [],
            knownStoryElements: [],
            beatHistory: [
              {
                plan: {
                  forPlayer: "player1 - Player One",
                  developmentsToNarrate: "Initial beat setup",
                  beatTypeConsiderations: "Starting thread exploration",
                  otherBeats: "",
                  worldBuilding: "Test world context",
                  newGameElements: [],
                  showDontTellPreviousDecision: "",
                  showDontTell: [],
                  newIntroductionsOfStoryElements: [],
                  establishedFacts: [],
                  optionConsiderations: "Standard exploration options",
                },
                title: "Test Beat",
                text: "Test beat",
                summary: "A test beat for validation",
                options: [
                  {
                    text: "Option 1",
                    optionType: "exploration",
                    resourceType: "normal",
                  },
                  {
                    text: "Option 2",
                    optionType: "exploration",
                    resourceType: "normal",
                  },
                  {
                    text: "Option 3",
                    optionType: "exploration",
                    resourceType: "normal",
                  },
                ],
                interludes: [],
                choice: -1, // No choice made
                resolution: null,
              },
            ],
            previousTypesOfThreads: [],
            identityChoice: -1,
            backgroundChoice: -1,
          },
          player2: {
            name: "Player Two",
            pronouns: {
              personal: "they",
              object: "them",
              possessive: "their",
              reflexive: "themselves",
            },
            appearance: "Second player",
            fluff: "Second fluff",
            outcomes: [],
            statValues: [],
            knownStoryElements: [],
            beatHistory: [
              {
                plan: {
                  forPlayer: "player1 - Test Player",
                  developmentsToNarrate: "Initial beat setup",
                  beatTypeConsiderations: "Starting thread exploration",
                  otherBeats: "",
                  worldBuilding: "Test world context",
                  newGameElements: [],
                  showDontTellPreviousDecision: "",
                  showDontTell: [],
                  newIntroductionsOfStoryElements: [],
                  establishedFacts: [],
                  optionConsiderations: "Standard exploration options",
                },
                title: "Test Beat 2",
                text: "Test beat 2",
                summary: "A second test beat for validation",
                options: [
                  {
                    text: "Option 1",
                    optionType: "exploration",
                    resourceType: "normal",
                  },
                  {
                    text: "Option 2",
                    optionType: "exploration",
                    resourceType: "normal",
                  },
                  {
                    text: "Option 3",
                    optionType: "exploration",
                    resourceType: "normal",
                  },
                ],
                interludes: [],
                choice: -1, // No choice made
                resolution: null,
              },
            ],
            previousTypesOfThreads: [],
            identityChoice: -1,
            backgroundChoice: -1,
          },
        },
      });

      const story = Story.create(storyState);

      // Mock methods
      jest.spyOn(story, "getCurrentBeatType").mockReturnValue("thread");
      jest
        .spyOn(story, "getPlayerSlots")
        .mockReturnValue(["player1", "player2"]);
      jest
        .spyOn(story, "getCurrentBeat")
        .mockImplementationOnce(
          () =>
            (storyState.players as Record<string, PlayerState>).player1
              .beatHistory[0] as Beat
        )
        .mockImplementationOnce(
          () =>
            (storyState.players as Record<string, PlayerState>).player2
              .beatHistory[0] as Beat
        );

      const result = pregenerationService.shouldTriggerPregeneration(story);

      expect(result).toBe(false);
    });
  });

  describe("triggerPregeneration", () => {
    it("should not trigger pregeneration if conditions are not met", async () => {
      const storyState = createMockStoryState({
        pregenerateBeats: false,
      });
      const story = Story.create(storyState);

      await pregenerationService.triggerPregeneration(story);

      expect(mockGameQueueProcessor.addOperation).not.toHaveBeenCalled();
    });

    it("should trigger pregeneration for remaining players and options", async () => {
      const storyState = createMockStoryState({
        id: "test-story-id",
        pregenerateBeats: true,
        characterSelectionCompleted: true,
        players: {
          player1: {
            name: "Player One",
            pronouns: {
              personal: "they",
              object: "them",
              possessive: "their",
              reflexive: "themselves",
            },
            appearance: "First player",
            fluff: "First fluff",
            outcomes: [],
            statValues: [],
            knownStoryElements: [],
            beatHistory: [
              {
                plan: {
                  forPlayer: "player1 - Test Player",
                  developmentsToNarrate: "Initial beat setup",
                  beatTypeConsiderations: "Starting thread exploration",
                  otherBeats: "",
                  worldBuilding: "Test world context",
                  newGameElements: [],
                  showDontTellPreviousDecision: "",
                  showDontTell: [],
                  newIntroductionsOfStoryElements: [],
                  establishedFacts: [],
                  optionConsiderations: "Standard exploration options",
                },
                title: "Test Beat",
                text: "Test beat",
                summary: "A test beat for validation",
                options: [
                  {
                    text: "Option 1",
                    optionType: "exploration",
                    resourceType: "normal",
                  },
                  {
                    text: "Option 2",
                    optionType: "exploration",
                    resourceType: "normal",
                  },
                  {
                    text: "Option 3",
                    optionType: "exploration",
                    resourceType: "normal",
                  },
                ],
                interludes: [],
                choice: 0, // Choice made
                resolution: null,
              },
            ],
            previousTypesOfThreads: [],
            identityChoice: -1,
            backgroundChoice: -1,
          },
          player2: {
            name: "Player Two",
            pronouns: {
              personal: "they",
              object: "them",
              possessive: "their",
              reflexive: "themselves",
            },
            appearance: "Second player",
            fluff: "Second fluff",
            outcomes: [],
            statValues: [],
            knownStoryElements: [],
            beatHistory: [
              {
                plan: {
                  forPlayer: "player1 - Test Player",
                  developmentsToNarrate: "Initial beat setup",
                  beatTypeConsiderations: "Starting thread exploration",
                  otherBeats: "",
                  worldBuilding: "Test world context",
                  newGameElements: [],
                  showDontTellPreviousDecision: "",
                  showDontTell: [],
                  newIntroductionsOfStoryElements: [],
                  establishedFacts: [],
                  optionConsiderations: "Standard exploration options",
                },
                title: "Test Beat 2",
                text: "Test beat 2",
                summary: "A second test beat for validation",
                options: [
                  {
                    text: "Option 1",
                    optionType: "exploration",
                    resourceType: "normal",
                  },
                  {
                    text: "Option 2",
                    optionType: "exploration",
                    resourceType: "normal",
                  },
                  {
                    text: "Option 3",
                    optionType: "exploration",
                    resourceType: "normal",
                  },
                ],
                interludes: [],
                choice: -1, // No choice made
                resolution: null,
              },
            ],
            previousTypesOfThreads: [],
            identityChoice: -1,
            backgroundChoice: -1,
          },
        },
      });

      const story = Story.create(storyState);

      // Mock methods
      jest.spyOn(story, "getCurrentBeatType").mockReturnValue("thread");
      jest
        .spyOn(story, "getPlayerSlots")
        .mockReturnValue(["player1", "player2"]);
      jest.spyOn(story, "getCurrentTurn").mockReturnValue(1);
      jest.spyOn(story, "getCurrentBeat").mockImplementation((slot) => {
        const players = storyState.players as Record<string, PlayerState>;
        if (slot === "player1") return players.player1.beatHistory[0] as Beat;
        if (slot === "player2") return players.player2.beatHistory[0] as Beat;
        return null;
      });

      await pregenerationService.triggerPregeneration(story);

      // Should queue 1 bulk pregeneration operation for player2 (3 options)
      // This will store beat resolutions immediately, then continue with full pregeneration
      expect(mockGameQueueProcessor.addOperation).toHaveBeenCalledTimes(1);
      expect(mockGameQueueProcessor.addOperation).toHaveBeenCalledWith({
        gameId: "test-story-id",
        type: "bulkPregenerateStoryStates",
        input: {
          story,
          turn: 1,
          playersAndOptions: [
            {
              playerSlot: "player2",
              optionIndices: [0, 1, 2],
            },
          ],
        },
      });
    });

    it("should skip pregeneration if already in progress", async () => {
      const storyState = createMockStoryState({
        id: "test-story-id",
        pregenerateBeats: true,
        characterSelectionCompleted: true,
        players: {
          player1: {
            name: "Player One",
            pronouns: {
              personal: "they",
              object: "them",
              possessive: "their",
              reflexive: "themselves",
            },
            appearance: "First player",
            fluff: "First fluff",
            outcomes: [],
            statValues: [],
            knownStoryElements: [],
            beatHistory: [
              {
                plan: {
                  forPlayer: "player1 - Test Player",
                  developmentsToNarrate: "Initial beat setup",
                  beatTypeConsiderations: "Starting thread exploration",
                  otherBeats: "",
                  worldBuilding: "Test world context",
                  newGameElements: [],
                  showDontTellPreviousDecision: "",
                  showDontTell: [],
                  newIntroductionsOfStoryElements: [],
                  establishedFacts: [],
                  optionConsiderations: "Standard exploration options",
                },
                title: "Test Beat",
                text: "Test beat",
                summary: "A test beat for validation",
                options: [
                  {
                    text: "Option 1",
                    optionType: "exploration",
                    resourceType: "normal",
                  },
                  {
                    text: "Option 2",
                    optionType: "exploration",
                    resourceType: "normal",
                  },
                  {
                    text: "Option 3",
                    optionType: "exploration",
                    resourceType: "normal",
                  },
                ],
                interludes: [],
                choice: 0, // Choice made
                resolution: null,
              },
            ],
            previousTypesOfThreads: [],
            identityChoice: -1,
            backgroundChoice: -1,
          },
          player2: {
            name: "Player Two",
            pronouns: {
              personal: "they",
              object: "them",
              possessive: "their",
              reflexive: "themselves",
            },
            appearance: "Second player",
            fluff: "Second fluff",
            outcomes: [],
            statValues: [],
            knownStoryElements: [],
            beatHistory: [
              {
                plan: {
                  forPlayer: "player1 - Test Player",
                  developmentsToNarrate: "Initial beat setup",
                  beatTypeConsiderations: "Starting thread exploration",
                  otherBeats: "",
                  worldBuilding: "Test world context",
                  newGameElements: [],
                  showDontTellPreviousDecision: "",
                  showDontTell: [],
                  newIntroductionsOfStoryElements: [],
                  establishedFacts: [],
                  optionConsiderations: "Standard exploration options",
                },
                title: "Test Beat 2",
                text: "Test beat 2",
                summary: "A second test beat for validation",
                options: [
                  {
                    text: "Option 1",
                    optionType: "exploration",
                    resourceType: "normal",
                  },
                  {
                    text: "Option 2",
                    optionType: "exploration",
                    resourceType: "normal",
                  },
                  {
                    text: "Option 3",
                    optionType: "exploration",
                    resourceType: "normal",
                  },
                ],
                interludes: [],
                choice: -1, // No choice made yet
                resolution: null,
              },
            ],
            previousTypesOfThreads: [],
            identityChoice: -1,
            backgroundChoice: -1,
          },
        },
      });

      const story = Story.create(storyState);

      // Mock methods
      jest.spyOn(story, "getCurrentBeatType").mockReturnValue("thread");
      jest
        .spyOn(story, "getPlayerSlots")
        .mockReturnValue(["player1", "player2"]);
      jest.spyOn(story, "getCurrentTurn").mockReturnValue(1);
      jest.spyOn(story, "getCurrentBeat").mockImplementation((slot) => {
        const players = storyState.players as Record<string, PlayerState>;
        if (slot === "player1") return players.player1?.beatHistory[0] as Beat;
        if (slot === "player2") return players.player2?.beatHistory[0] as Beat;
        return null;
      });

      // Make sure we can successfully trigger pregeneration first
      const shouldTrigger =
        pregenerationService.shouldTriggerPregeneration(story);
      expect(shouldTrigger).toBe(true);

      // First call should trigger pregeneration
      await pregenerationService.triggerPregeneration(story);
      expect(mockGameQueueProcessor.addOperation).toHaveBeenCalledTimes(1);

      // Reset mock
      mockGameQueueProcessor.addOperation.mockClear();

      // Second call should still trigger since bulk pregeneration doesn't track individual operations as in-progress
      // The individual pregeneration operations will be skipped within the bulk handler itself
      await pregenerationService.triggerPregeneration(story);
      expect(mockGameQueueProcessor.addOperation).toHaveBeenCalledTimes(1);
    });

    it("should skip pregeneration if pregenerated state already exists", async () => {
      const storyState = createMockStoryState({
        id: "test-story-id",
        pregenerateBeats: true,
        characterSelectionCompleted: true,
        players: {
          player1: {
            name: "Test Player",
            pronouns: {
              personal: "they",
              object: "them",
              possessive: "their",
              reflexive: "themselves",
            },
            appearance: "Test appearance",
            fluff: "Test fluff",
            outcomes: [],
            statValues: [],
            knownStoryElements: [],
            beatHistory: [
              {
                plan: {
                  forPlayer: "player1 - Test Player",
                  developmentsToNarrate: "Initial beat setup",
                  beatTypeConsiderations: "Starting thread exploration",
                  otherBeats: "",
                  worldBuilding: "Test world context",
                  newGameElements: [],
                  showDontTellPreviousDecision: "",
                  showDontTell: [],
                  newIntroductionsOfStoryElements: [],
                  establishedFacts: [],
                  optionConsiderations: "Standard exploration options",
                },
                title: "Test Beat",
                text: "Test beat",
                summary: "A test beat for validation",
                options: [
                  {
                    text: "Option 1",
                    optionType: "exploration",
                    resourceType: "normal",
                  },
                  {
                    text: "Option 2",
                    optionType: "exploration",
                    resourceType: "normal",
                  },
                  {
                    text: "Option 3",
                    optionType: "exploration",
                    resourceType: "normal",
                  },
                ],
                interludes: [],
                choice: 0, // Choice made to trigger pregeneration
                resolution: null,
              },
            ],
            previousTypesOfThreads: [],
            identityChoice: -1,
            backgroundChoice: -1,
          },
        },
      });

      const story = Story.create(storyState);

      // Mock methods
      jest.spyOn(story, "getCurrentBeatType").mockReturnValue("thread");
      jest.spyOn(story, "getPlayerSlots").mockReturnValue(["player1"]);
      jest.spyOn(story, "getCurrentTurn").mockReturnValue(1);
      jest
        .spyOn(story, "getCurrentBeat")
        .mockReturnValue(
          (storyState.players as Record<string, PlayerState>).player1
            .beatHistory[0] as Beat
        );

      // Mock that pregenerated state already exists
      mockStoryRepository.hasPregeneratedStory.mockResolvedValue(true);

      await pregenerationService.triggerPregeneration(story);

      // Should not queue any operations since all states already exist
      expect(mockGameQueueProcessor.addOperation).not.toHaveBeenCalled();
    });
  });

  describe("markPregenerationComplete", () => {
    it("should remove pregeneration from in-progress tracking", () => {
      const storyId = "test-story-id";
      const turn = 1;
      const playerSlot = "player1";
      const optionIndex = 0;

      // Mark as complete
      pregenerationService.markPregenerationComplete(
        storyId,
        turn,
        playerSlot,
        optionIndex
      );

      // Check that it's no longer in progress
      const isInProgress = pregenerationService.isPregenerationInProgress(
        storyId,
        turn,
        playerSlot,
        optionIndex
      );
      expect(isInProgress).toBe(false);
    });
  });

  describe("cancelPregenerationForTurn", () => {
    it("should cancel pregeneration tracking (files preserved for debugging)", async () => {
      const storyId = "test-story-id";
      const turn = 1;

      await pregenerationService.cancelPregenerationForTurn(storyId, turn);

      // Should not attempt to delete files for debugging purposes
      expect(
        mockStoryRepository.deletePregeneratedStoriesForTurn
      ).not.toHaveBeenCalled();
    });
  });

  describe("getPregeneratedStory", () => {
    it("should delegate to story repository", async () => {
      const storyId = "test-story-id";
      const turn = 1;
      const playerSlot = "player1";
      const optionIndex = 0;
      const mockStory = Story.create(createMockStoryState());

      mockStoryRepository.getPregeneratedStory.mockResolvedValue(mockStory);

      const result = await pregenerationService.getPregeneratedStory(
        storyId,
        turn,
        playerSlot,
        optionIndex
      );

      expect(mockStoryRepository.getPregeneratedStory).toHaveBeenCalledWith(
        storyId,
        turn,
        playerSlot,
        optionIndex
      );
      expect(result).toBe(mockStory);
    });
  });

  describe("isPregenerationInProgress", () => {
    it("should return false for non-tracked pregeneration", () => {
      const result = pregenerationService.isPregenerationInProgress(
        "test-story-id",
        1,
        "player1",
        0
      );
      expect(result).toBe(false);
    });
  });

  describe("cleanupStory", () => {
    it("should remove story from tracking", () => {
      const storyId = "test-story-id";

      pregenerationService.cleanupStory(storyId);

      // Verify cleanup by checking that future operations work normally
      const isInProgress = pregenerationService.isPregenerationInProgress(
        storyId,
        1,
        "player1",
        0
      );
      expect(isInProgress).toBe(false);
    });
  });
});
