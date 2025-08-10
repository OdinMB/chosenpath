// Test helper utilities
import { Story } from 'core/models/Story.js';
import { StoryState, PlayerSlot, GameModes } from 'core/types/index.js';

/**
 * Create a minimal story state for testing
 */
export function createMockStoryState(overrides: Partial<StoryState> = {}): StoryState {
  return {
    id: 'test-story-123',
    title: 'Test Story',
    imageInstructions: {
      visualStyle: 'digital illustration',
      atmosphere: 'mysterious and adventurous',
      colorPalette: 'vibrant colors',
      settingDetails: 'fantasy medieval architecture with magical elements',
      characterStyle: 'semi-realistic with expressive features',
      artInfluences: 'fantasy art',
      coverPrompt: 'A test cover'
    },
    gameMode: GameModes.SinglePlayer,
    difficultyLevel: { title: 'Balanced', modifier: 0 },
    guidelines: {
      world: 'A test world for unit testing',
      rules: ['Test rule 1'],
      tone: ['Test tone'],
      conflicts: ['Test conflict'],
      decisions: ['Test decision'],
      typesOfThreads: ['Test thread type'],
      switchAndThreadInstructions: [],
    },
    storyElements: [],
    worldFacts: [],
    sharedOutcomes: [],
    sharedStats: [],
    sharedStatValues: [],
    playerStats: [],
    players: {
      player1: {
        name: 'Test Player',
        pronouns: { 
          personal: 'they', 
          object: 'them', 
          possessive: 'their', 
          reflexive: 'themselves' 
        },
        appearance: 'A test character',
        fluff: 'Test character background',
        outcomes: [],
        statValues: [],
        knownStoryElements: [],
        beatHistory: [],
        previousTypesOfThreads: [],
        identityChoice: -1,
        backgroundChoice: -1,
      },
    },
    storyPhases: [],
    maxTurns: 10,
    characterSelectionCompleted: true,
    characterSelectionOptions: {},
    characterSelectionIntroduction: { title: 'Test Story Introduction', text: 'Welcome to the test story!' },
    generateImages: false,
    pregenerateBeats: false,
    images: [],
    playerCodes: { player1: 'TEST123' },
    ...overrides,
  };
}

/**
 * Create a Story instance for testing
 */
export function createMockStory(overrides: Partial<StoryState> = {}): Story {
  return Story.create(createMockStoryState(overrides));
}

/**
 * Create a story with multiple players for multiplayer testing
 */
export function createMockMultiplayerStory(playerCount: number = 2): Story {
  const players: Record<string, StoryState['players'][PlayerSlot]> = {};
  const playerCodes: Record<string, string> = {};
  
  for (let i = 1; i <= playerCount; i++) {
    const playerSlot = `player${i}` as PlayerSlot;
    players[playerSlot] = {
      name: `Test Player ${i}`,
      pronouns: { 
        personal: 'they', 
        object: 'them', 
        possessive: 'their', 
        reflexive: 'themselves' 
      },
      appearance: `Test character ${i}`,
      fluff: `Test character ${i} background`,
      outcomes: [],
      statValues: [],
      knownStoryElements: [],
      beatHistory: [],
      previousTypesOfThreads: [],
      identityChoice: -1,
      backgroundChoice: -1,
    };
    playerCodes[playerSlot] = `TEST${i}23`;
  }

  return createMockStory({
    gameMode: GameModes.Cooperative,
    players,
    playerCodes,
  });
}

/**
 * Wait for a specified amount of time (useful for testing async operations)
 */
export function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create a mock beat for testing
 */
export function createMockBeat(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Test Beat',
    text: 'This is a test beat.',
    options: [
      { optionType: 'exploration' as const, resourceType: 'normal' as const, text: 'Test option 1' },
      { optionType: 'exploration' as const, resourceType: 'normal' as const, text: 'Test option 2' },
      { optionType: 'exploration' as const, resourceType: 'normal' as const, text: 'Test option 3' },
    ],
    summary: 'Test beat summary',
    interludes: [],
    choice: -1,
    resolution: null,
    ...overrides,
  };
}