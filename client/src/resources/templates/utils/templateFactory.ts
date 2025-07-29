import {
  PlayerCount,
  PLAYER_SLOTS,
  StoryTemplate,
  GameModes,
  PublicationStatus,
  StoryElement,
} from "core/types";
import { MAX_PLAYERS } from "core/config";
import { DEFAULT_DIFFICULTY_LEVELS } from "core/utils/difficultyUtils";

/**
 * Creates a default empty template for a single player game
 */
export function createDefaultTemplate(): StoryTemplate {
  // Start with a record that we'll build up with our properties
  const template: Record<string, unknown> = {
    id: "",
    gameMode: GameModes.Cooperative,
    playerCountMin: 1 as PlayerCount,
    playerCountMax: 1 as PlayerCount,
    maxTurnsMin: 20,
    maxTurnsMax: 25,
    teaser: "",
    tags: [],
    difficultyLevels: [
      DEFAULT_DIFFICULTY_LEVELS.find((level) => level.modifier === 0)!, // Balanced
      DEFAULT_DIFFICULTY_LEVELS.find((level) => level.modifier === 10)!, // Relaxed
      DEFAULT_DIFFICULTY_LEVELS.find((level) => level.modifier === -10)!, // Challenging
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    title: "",
    // containsImages will be set by server based on user permissions
    imageInstructions: {
      visualStyle: "",
      atmosphere: "",
      colorPalette: "",
      settingDetails: "",
      characterStyle: "",
      artInfluences: "",
      coverPrompt: "",
    },
    publicationStatus: PublicationStatus.Draft,
    showOnWelcomeScreen: false,
    order: 999, // Default to a high number to place new templates at the end
    guidelines: {
      world: "",
      rules: [],
      tone: [],
      conflicts: [],
      decisions: [],
      typesOfThreads: [],
      switchAndThreadInstructions: [],
    },
    storyElements: [] as StoryElement[],
    sharedOutcomes: [],
    statGroups: [],
    sharedStats: [],
    playerStats: [],
    characterSelectionIntroduction: {
      title: "",
      text: "",
    },
  };

  // Add player properties using PLAYER_SLOTS, respecting MAX_PLAYERS
  const relevantPlayerSlots = PLAYER_SLOTS.slice(0, MAX_PLAYERS);
  for (const playerSlot of relevantPlayerSlots) {
    template[playerSlot] = createEmptyPlayerOptions();
  }

  return template as StoryTemplate;
}

/**
 * Creates empty player options used in template setup
 */
function createEmptyPlayerOptions() {
  return {
    outcomes: [],
    possibleCharacterIdentities: [
      {
        name: "",
        pronouns: {
          personal: "they",
          object: "them",
          possessive: "their",
          reflexive: "themselves",
        },
        appearance: "",
      },
    ],
    possibleCharacterBackgrounds: [
      {
        title: "",
        fluffTemplate: "",
        initialPlayerStatValues: [],
      },
    ],
  };
}
