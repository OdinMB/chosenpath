import {
  PlayerSlot,
  StoryState,
  StoryTemplate,
  DifficultyLevel,
  PlayerCount,
  Outcome,
  PlayerOptionsGeneration,
  ReflectionQuestions,
  categoryFromTemplateTags,
  keptReflectionQuestions,
  kidAgesFrom,
  readReflectionQuestions,
} from "core/types/index.js";
import { outcomesInPlay } from "core/utils/outcomeStates.js";
import {
  checkStoryStateBackgrounds,
  describeBackgroundFixes,
} from "core/utils/statValueCheck.js";
import { loadTemplateImages } from "shared/storageUtils.js";
import { Logger } from "shared/logger.js";

/**
 * Creates a story state from a template with the given parameters
 * @param gameId The ID of the story
 * @param template The template to convert
 * @param playerCount The number of players
 * @param maxTurns The maximum number of turns
 * @param generateImages Whether to generate images
 * @param pregenerateBeats Whether to pregenerate story beats
 * @param difficultyLevel The chosen difficulty level for this story
 * @param playerCodes The player codes to include in the state
 * @param batchReflectionQuestions A several-stories start's reflection questions, in place of the template's (none: {})
 * @returns A complete StoryState ready to be used in a Story instance
 */
export function createStoryStateFromTemplate(
  gameId: string,
  template: StoryTemplate,
  playerCount: PlayerCount,
  maxTurns: number,
  generateImages: boolean,
  pregenerateBeats: boolean,
  difficultyLevel: DifficultyLevel,
  playerCodes: Record<PlayerSlot, string>, // also used to determine the number of players
  batchReflectionQuestions?: ReflectionQuestions
): StoryState {
  const sharedStatValues = template.sharedStats.map((stat) => ({
    statId: stat.id,
    value: stat.initialValue,
  }));

  // Start with basic story state structure
  const storyState: StoryState = {
    id: gameId,
    templateId: template.id,
    title: template.title,
    imageInstructions: template.imageInstructions,
    gameMode: template.gameMode,
    difficultyLevel: difficultyLevel,
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
    generateImages: generateImages,
    pregenerateBeats: pregenerateBeats,
    images: loadTemplateImages(template.id),
    playerCodes,
  };
  const category = categoryFromTemplateTags(template.tags);
  if (category) {
    storyState.category = category;
    // A template tagged Kids: the children's ages its editor set (the read-with-kids setting), as a custom story records its form's
    const kidAges = kidAgesFrom(template.kidAges);
    if (kidAges) storyState.kidAges = kidAges;
  }

  // Set up character selection options for the requested player count
  // Only include active players based on the requested player count
  const relevantPlayerSlots = Object.keys(playerCodes);
  for (const slot of relevantPlayerSlots) {
    // A seat's options, as far as the template holds any (checked below)
    const playerOptions = template[slot as keyof typeof template] as
      | PlayerOptionsGeneration
      | undefined;

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

  // The reflection questions for the outcomes this story plays: the several-stories start's, else the World's
  const reflectionQuestions = keptReflectionQuestions(
    batchReflectionQuestions ?? worldReflectionQuestions(template),
    outcomesInPlay(storyState).map(({ outcome }) => outcome.id)
  );
  if (reflectionQuestions) storyState.reflectionQuestions = reflectionQuestions;

  // Templates saved before the check (or imported as files) can hold
  // background values of the wrong type; the story starts with them read by type
  const { state: checkedState, fixed } =
    checkStoryStateBackgrounds(storyState);
  if (fixed.length > 0) {
    Logger.Story.log(
      `Checked background values of story ${gameId} from template ${
        template.id
      }: ${describeBackgroundFixes(fixed)}`
    );
  }

  return checkedState;
}

/** The template's reflection questions, if it holds them in a form they can be read in. */
function worldReflectionQuestions(template: StoryTemplate): ReflectionQuestions | undefined {
  const read = readReflectionQuestions(template.reflectionQuestions);
  return "questions" in read ? (read.questions ?? undefined) : undefined;
}

/**
 * Creates an empty player state with default values
 * @param outcomes The outcomes to include for the player
 * @returns An empty player state
 */
export function createEmptyPlayerState(outcomes: Outcome[] = []) {
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
