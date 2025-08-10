import { Story } from "core/models/Story.js";
import { createMockStoryState } from "../../__mocks__/game/services/AIStoryGenerator.js";
import type { PlayerState } from "core/types/index.js";

// Simple integration tests focusing on story state management
describe("Pregeneration Integration - Story State", () => {
  describe("Story State Management", () => {
    it("should maintain pregeneration settings across story operations", () => {
      const storyState = createMockStoryState({
        id: "integration-test-story",
        pregenerateBeats: true,
        characterSelectionCompleted: true,
      });

      const story = Story.create(storyState);
      expect(story.getState().pregenerateBeats).toBe(true);

      // Clone the story (common operation)
      const clonedStory = story.clone();
      expect(clonedStory.getState().pregenerateBeats).toBe(true);
      expect(clonedStory.getState().id).toBe("integration-test-story");
    });

    it("should handle multiplayer story state with pregeneration", () => {
      const storyState = createMockStoryState({
        pregenerateBeats: true,
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
            beatHistory: [],
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
            beatHistory: [],
            previousTypesOfThreads: [],
            identityChoice: -1,
            backgroundChoice: -1,
          },
        },
      });

      const story = Story.create(storyState);

      expect(story.getState().pregenerateBeats).toBe(true);
      expect(Object.keys(story.getState().players)).toHaveLength(2);
      const players = story.getState().players as Record<string, PlayerState>;
      expect(players.player1).toBeDefined();
      expect(players.player2).toBeDefined();
    });

    it("should handle story progression with pregeneration enabled", () => {
      const storyState = createMockStoryState({
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
                title: "Critical Moment",
                text: "A critical moment arrives.",
                summary: "A critical decision point",
                options: [
                  {
                    text: "Act quickly",
                    optionType: "challenge",
                    resourceType: "normal",
                    riskType: "normal",
                    basePoints: 50,
                    modifiersToSuccessRate: [],
                  },
                  {
                    text: "Think it through",
                    optionType: "exploration",
                    resourceType: "normal",
                  },
                  {
                    text: "Ask for help",
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
      const storyWithChoice = story.updateChoice("player1", 1);
      expect(storyWithChoice.getState().pregenerateBeats).toBe(true);
      const playersWithChoice = storyWithChoice.getState().players as Record<
        string,
        PlayerState
      >;
      expect(playersWithChoice.player1?.beatHistory[0]?.choice).toBe(1);
    });
  });

  describe("Pregeneration Logic Validation", () => {
    it("should validate pregeneration trigger conditions", () => {
      // Test single player scenario
      const singlePlayerState = createMockStoryState({
        pregenerateBeats: true,
        characterSelectionCompleted: true,
        players: {
          player1: {
            name: "Solo Player",
            pronouns: {
              personal: "they",
              object: "them",
              possessive: "their",
              reflexive: "themselves",
            },
            appearance: "Solo appearance",
            fluff: "Solo fluff",
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
                title: "Journey Begins",
                text: "Your journey begins.",
                summary: "The start of an adventure",
                options: [
                  {
                    text: "Go north",
                    optionType: "exploration",
                    resourceType: "normal",
                  },
                  {
                    text: "Go south",
                    optionType: "exploration",
                    resourceType: "normal",
                  },
                  {
                    text: "Stay here",
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
        },
      });

      const story = Story.create(singlePlayerState);

      // Validate conditions for pregeneration
      expect(story.getState().pregenerateBeats).toBe(true);
      expect(story.getState().characterSelectionCompleted).toBe(true);
      const players2 = story.getState().players as Record<string, PlayerState>;
      expect(players2.player1?.beatHistory[0]?.choice).toBe(0);
    });

    it("should handle pregeneration disabled scenarios", () => {
      const storyState = createMockStoryState({
        pregenerateBeats: false, // Disabled
        characterSelectionCompleted: true,
      });

      const story = Story.create(storyState);
      expect(story.getState().pregenerateBeats).toBe(false);
    });

    it("should handle character selection not completed scenarios", () => {
      const storyState = createMockStoryState({
        pregenerateBeats: true,
        characterSelectionCompleted: false, // Not completed
      });

      const story = Story.create(storyState);
      expect(story.getState().pregenerateBeats).toBe(true);
      expect(story.getState().characterSelectionCompleted).toBe(false);
    });
  });
});
