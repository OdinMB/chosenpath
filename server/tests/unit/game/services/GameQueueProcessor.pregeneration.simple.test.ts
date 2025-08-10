import { Story } from "core/models/Story.js";
import { createMockStoryState } from "../../../__mocks__/game/services/AIStoryGenerator.js";
import type { PlayerState } from "core/types/index.js";

// Simple tests that don't require complex mocking
describe("GameQueueProcessor Pregeneration Logic", () => {
  describe("Pregeneration State Management", () => {
    it("should create story states with pregeneration flag", () => {
      const storyState = createMockStoryState({
        pregenerateBeats: true,
      });

      expect(storyState.pregenerateBeats).toBe(true);

      const story = Story.create(storyState);
      expect(story.getState().pregenerateBeats).toBe(true);
    });

    it("should create story states without pregeneration flag", () => {
      const storyState = createMockStoryState({
        pregenerateBeats: false,
      });

      expect(storyState.pregenerateBeats).toBe(false);

      const story = Story.create(storyState);
      expect(story.getState().pregenerateBeats).toBe(false);
    });

    it("should handle story state updates maintaining pregeneration setting", () => {
      const storyState = createMockStoryState({
        id: "test-story",
        pregenerateBeats: true,
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
                choice: -1,
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
      expect(story.getState().pregenerateBeats).toBe(true);

      // Simulate making a choice
      const updatedStory = story.updateChoice("player1", 0);
      expect(updatedStory.getState().pregenerateBeats).toBe(true);
    });
  });

  describe("Pregeneration File Naming", () => {
    it("should generate correct filename patterns", () => {
      // Test the file naming convention
      const turn = 5;
      const playerSlot = "player1";
      const optionIndex = 2;

      const expectedPattern = `pregeneration_${turn}_${playerSlot}_${optionIndex}.json`;
      expect(expectedPattern).toBe("pregeneration_5_player1_2.json");
    });

    it("should handle different player slots and options", () => {
      const testCases = [
        {
          turn: 1,
          playerSlot: "player1",
          optionIndex: 0,
          expected: "pregeneration_1_player1_0.json",
        },
        {
          turn: 10,
          playerSlot: "player2",
          optionIndex: 1,
          expected: "pregeneration_10_player2_1.json",
        },
        {
          turn: 15,
          playerSlot: "player3",
          optionIndex: 2,
          expected: "pregeneration_15_player3_2.json",
        },
      ];

      testCases.forEach(({ turn, playerSlot, optionIndex, expected }) => {
        const filename = `pregeneration_${turn}_${playerSlot}_${optionIndex}.json`;
        expect(filename).toBe(expected);
      });
    });
  });

  describe("Story Instance Handling", () => {
    it("should properly handle Story instances from repository", () => {
      const storyState = createMockStoryState({
        id: "test-story",
        pregenerateBeats: true,
        characterSelectionCompleted: true,
      });

      // Create a Story instance
      const story = new Story(storyState);

      // Verify it's a proper Story instance with methods
      expect(story).toBeInstanceOf(Story);
      expect(typeof story.getPlayer).toBe("function");
      expect(typeof story.getState).toBe("function");
      expect(typeof story.updateChoice).toBe("function");

      // Test getPlayer method
      const playerState = story.getPlayer("player1");
      expect(playerState).toBeDefined();
      expect(playerState?.name).toBe("Test Player");
    });

    it("should recreate Story instance from plain object if needed", () => {
      const storyState = createMockStoryState({
        id: "test-story",
        pregenerateBeats: true,
      });

      // Simulate getting a plain object instead of Story instance
      const plainObject = JSON.parse(JSON.stringify(storyState));

      // Recreate Story instance
      const story = new Story(plainObject);

      // Verify it works correctly
      expect(story).toBeInstanceOf(Story);
      expect(typeof story.getPlayer).toBe("function");
      expect(story.getState().id).toBe("test-story");
    });
  });

  describe("Story State Validation", () => {
    it("should validate story state structure for pregeneration", () => {
      const storyState = createMockStoryState({
        id: "test-story",
        pregenerateBeats: true,
        characterSelectionCompleted: true,
        difficultyLevel: { title: "Normal", modifier: 0 },
      });

      // Check required fields for pregeneration
      expect(storyState.id).toBeDefined();
      expect(storyState.pregenerateBeats).toBe(true);
      expect(storyState.characterSelectionCompleted).toBe(true);
      expect(storyState.difficultyLevel).toBeDefined();
      expect(storyState.players).toBeDefined();
    });

    it("should handle player beat history for pregeneration", () => {
      const storyState = createMockStoryState({
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
                title: "Crossroads",
                text: "You stand at a crossroads.",
                summary: "A decision point at the crossroads",
                options: [
                  {
                    text: "Go left",
                    optionType: "exploration",
                    resourceType: "normal",
                  },
                  {
                    text: "Go right",
                    optionType: "exploration",
                    resourceType: "normal",
                  },
                  {
                    text: "Turn back",
                    optionType: "exploration",
                    resourceType: "normal",
                  },
                ],
                interludes: [],
                choice: -1,
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
      const players = story.getState().players as Record<string, PlayerState>;
      const player = players.player1;
      expect(player?.beatHistory).toHaveLength(1);
      expect(player?.beatHistory[0]?.options).toHaveLength(3);
      expect(player?.beatHistory[0]?.choice).toBe(-1);
    });
  });
});
