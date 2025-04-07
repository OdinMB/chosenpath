import { StoryTemplate } from "@core/types/storyTemplate";
import { GameModes } from "@core/types/story";
import { PlayerCount } from "@core/types/player";
import { StoryElement } from "@core/types/storyElement";

/**
 * Creates a default empty template for a single player game
 */
export function createDefaultTemplate(): StoryTemplate {
  return {
    id: "",
    gameMode: GameModes.SinglePlayer,
    playerCount: 1 as PlayerCount,
    maxTurns: 10,
    tags: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    setup: {
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
      player1: createEmptyPlayerOptions(),
      player2: createEmptyPlayerOptions(),
      player3: createEmptyPlayerOptions(),
    },
  };
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
