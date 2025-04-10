import { StoryTemplate, GameModes } from "@core/types/story";
import { PlayerCount, PLAYER_SLOTS } from "@core/types/player";
import { StoryElement } from "@core/types/storyElement";
import { MAX_PLAYERS } from "@core/config";

/**
 * Creates a default empty template for a single player game
 */
export function createDefaultTemplate(): StoryTemplate {
  // Start with a record that we'll build up with our properties
  const template: Record<string, unknown> = {
    id: "",
    gameMode: GameModes.SinglePlayer,
    playerCountMin: 1 as PlayerCount,
    playerCountMax: 1 as PlayerCount,
    maxTurnsMin: 10,
    maxTurnsMax: 15,
    teaser: "",
    tags: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    title: "",
    guidelines: {
      world: "",
      rules: [],
      tone: [],
      conflicts: [],
      decisions: [],
    },
    storyElements: [] as StoryElement[],
    sharedOutcomes: [],
    statGroups: [],
    sharedStats: [],
    initialSharedStatValues: [],
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
