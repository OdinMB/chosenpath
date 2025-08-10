// Mock AI Story Generator for unit tests
import { Story } from "core/models/Story.js";
import { StoryState } from "core/types/index.js";
import { createMockStoryState as createBaseMockStoryState } from "../../../helpers/testHelpers.js";

// Mock story state for testing, reuse shared helper
const createMockStoryState = (
  overrides: Partial<StoryState> = {}
): StoryState => {
  return createBaseMockStoryState({
    id: "mock-story-id",
    title: "Mock Story",
    generateImages: false,
    pregenerateBeats: false,
    ...overrides,
  });
};

export class AIStoryGenerator {
  async createInitialState() {
    return createMockStoryState();
  }

  async generateStorySetup() {
    return {
      title: "Mock Story",
      guidelines: {
        world: "A mock world",
        rules: ["Mock rule"],
        tone: ["Mock tone"],
        conflicts: ["Mock conflict"],
        decisions: ["Mock decision"],
        typesOfThreads: ["Mock thread"],
        switchAndThreadInstructions: [],
      },
      difficultyLevel: { title: "Balanced", modifier: 0 },
      storyElements: [],
      sharedOutcomes: [],
      sharedStats: [],
      playerStats: [],
      characterSelectionIntroduction: {
        title: "Mock Story Introduction",
        text: "Mock intro",
      },
      player1: {
        outcomes: [],
        possibleCharacterIdentities: [],
        possibleCharacterBackgrounds: [],
      },
      imageInstructions: {
        visualStyle: "Digital illustration",
        atmosphere: "A test atmosphere for mock stories.",
        colorPalette: "Balanced colors",
        settingDetails: "Mock setting details",
        characterStyle: "Mock character style",
        artInfluences: "Mock art influences",
        coverPrompt: "A mock cover",
      },
    };
  }

  async generateBeats(story: Story) {
    // Return mock updated story, changes, and image requests
    const mockChanges: unknown[] = [];
    const mockImageRequests: unknown[] = [];

    // Create a simple mock updated story
    const currentState = story.getState();
    const player1 = currentState.players.player1;
    if (!player1) {
      throw new Error("Player1 not found in story state");
    }

    const updatedState = {
      ...currentState,
      // Add a mock beat to the first player
      players: {
        ...currentState.players,
        player1: {
          ...player1,
          beatHistory: [...player1.beatHistory],
        },
      },
    };

    return [Story.create(updatedState), mockChanges, mockImageRequests];
  }

  async generateSwitches(story: Story) {
    return story; // Return unchanged for mock
  }

  async generateThreads(story: Story) {
    return story; // Return unchanged for mock
  }
}

export const mockAIStoryGenerator = new AIStoryGenerator();

// Export the createMockStoryState function for use in tests
export { createMockStoryState };
