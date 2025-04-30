import { PlayerSlot, StoryState, StoryTemplate } from "core/types/index.js";
import { Image } from "core/types/image.js";
import { loadTemplateImages } from "shared/storageUtils.js";

/**
 * Creates a story state from a template with the given parameters
 * @param template The template to convert
 * @param playerCount The number of players
 * @param maxTurns The maximum number of turns
 * @param playerCodes The player codes to include in the state
 * @returns A complete StoryState ready to be used in a Story instance
 */
export function createStoryStateFromTemplate(
  template: StoryTemplate,
  maxTurns: number,
  playerCodes: Record<PlayerSlot, string> // also used to determine the number of players
): StoryState {
  let sharedStatValues = template.sharedStats.map((stat) => ({
    statId: stat.id,
    value: stat.initialValue,
  }));

  // Start with basic story state structure
  const storyState: StoryState = {
    templateId: template.id,
    title: template.title,
    imageInstructions: template.imageInstructions,
    gameMode: template.gameMode,
    guidelines: template.guidelines,
    storyElements: template.storyElements || [],
    worldFacts: [],
    sharedOutcomes: template.sharedOutcomes || [],
    sharedStats: template.sharedStats || [],
    sharedStatValues: sharedStatValues || [],
    playerStats: template.playerStats || [],
    players: {},
    storyPhases: [],
    maxTurns: maxTurns,
    characterSelectionCompleted: false,
    characterSelectionOptions: {},
    characterSelectionIntroduction: template.characterSelectionIntroduction,
    generateImages: false, // Template-based stories don't use image generation
    images: loadTemplateImages(template.id),
    playerCodes,
  };

  // Set up character selection options for the requested player count
  // Only include active players based on the requested player count
  const relevantPlayerSlots = Object.keys(playerCodes);
  for (const slot of relevantPlayerSlots) {
    // Cast slot to keyof StoryTemplate to access player options
    const playerSlot = slot as keyof typeof template;
    const playerOptions = template[playerSlot];

    if (!playerOptions || typeof playerOptions !== "object") {
      throw new Error(`Template missing options for player slot: ${slot}`);
    }

    // Type check that we have the expected properties
    if (
      !("outcomes" in playerOptions) ||
      !("possibleCharacterIdentities" in playerOptions) ||
      !("possibleCharacterBackgrounds" in playerOptions)
    ) {
      throw new Error(`Invalid player options in template for slot: ${slot}`);
    }

    // Add to character selection options with proper type casting
    storyState.characterSelectionOptions[slot] = {
      outcomes: playerOptions.outcomes || [],
      possibleCharacterIdentities:
        playerOptions.possibleCharacterIdentities || [],
      possibleCharacterBackgrounds:
        playerOptions.possibleCharacterBackgrounds || [],
    };

    // Initialize empty player state
    storyState.players[slot] = createEmptyPlayerState(
      playerOptions.outcomes || []
    );
  }

  return storyState;
}

/**
 * Creates an empty player state with default values
 * @param outcomes The outcomes to include for the player
 * @returns An empty player state
 */
export function createEmptyPlayerState(outcomes: any[] = []) {
  return {
    name: "",
    pronouns: {
      personal: "they",
      object: "them",
      possessive: "their",
      reflexive: "themselves",
    },
    appearance: "",
    fluff: "",
    outcomes,
    statValues: [],
    knownStoryElements: [],
    beatHistory: [],
    previousTypesOfThreads: [],
    identityChoice: -1,
    backgroundChoice: -1,
  };
}
