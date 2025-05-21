import dotenv from "dotenv";
import { ChatOpenAI } from "@langchain/openai";
import type {
  StoryState,
  StorySetupGeneration,
  PlayerOptionsGeneration,
  Change,
  Beat,
  BeatGeneration,
  SetOfBeatGenerationSchema,
  ImageRequest,
  SwitchAnalysis,
  ThreadAnalysis,
  PlayerCount,
  GameMode,
  DifficultyLevel,
  StatValueEntry,
} from "core/types/index.js";
import {
  createStorySetupSchema,
  createSwitchAnalysisSchema,
  threadAnalysisSchema,
  PLAYER_SLOTS,
  PlayerState,
} from "core/types/index.js";
import { Logger } from "shared/logger.js";
import { getPlayerSlots } from "core/utils/playerUtils.js";
import { createSetOfBeatGenerationSchema } from "core/types/beat.js";
import { StorySetupPromptService } from "./prompts/StorySetupPromptService.js";
import { SwitchPromptService } from "./prompts/SwitchPromptService.js";
import { ThreadPromptService } from "./prompts/ThreadPromptService.js";
import { BeatPromptService } from "./prompts/BeatPromptService.js";
import { Story } from "core/models/Story.js";
import {
  MOCK_STORIES_IN_DEVELOPMENT,
  MOCK_STORIES_DELAY_MS,
} from "core/config.js";
import {
  GENERATION_MODEL_NAME,
  GENERATION_MODEL_TEMPERATURE,
  TEXT_MODEL_NAME,
  TEXT_MODEL_TEMPERATURE,
  SWITCH_THREAD_MODEL_NAME,
  SWITCH_THREAD_MODEL_TEMPERATURE,
} from "server/config.js";
import { readStorageFile, writeStorageFile } from "shared/storageUtils.js";
import { createEmptyPlayerState } from "./StoryStateFactory.js";
import { z } from "zod";
import { templateIterationSections } from "core/utils/templateIterationSections.js";

dotenv.config();

export class AIStoryGenerator {
  private textModel: ChatOpenAI;
  private switchThreadModel: ChatOpenAI;
  private generationModel: ChatOpenAI;

  constructor() {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY environment variable is not set");
    }

    this.textModel = new ChatOpenAI({
      modelName: TEXT_MODEL_NAME as string,
      temperature: TEXT_MODEL_TEMPERATURE as number,
    });

    this.switchThreadModel = new ChatOpenAI({
      modelName: SWITCH_THREAD_MODEL_NAME as string,
      temperature: SWITCH_THREAD_MODEL_TEMPERATURE as number,
    });

    this.generationModel = new ChatOpenAI({
      modelName: GENERATION_MODEL_NAME as string,
      temperature: GENERATION_MODEL_TEMPERATURE as number,
    });
  }

  public async createInitialState(
    gameId: string,
    prompt: string,
    generateImages: boolean,
    playerCount: PlayerCount,
    maxTurns: number,
    gameMode: GameMode,
    difficultyLevel: DifficultyLevel | undefined
  ): Promise<StoryState> {
    const setup = await this.generateStorySetup(
      prompt,
      playerCount,
      gameMode,
      maxTurns
    );

    const players = this.createPlayersFromSetup(setup, playerCount);

    const sharedStatValues = setup.sharedStats.map(
      (stat) =>
        ({
          statId: stat.id,
          value: stat.initialValue,
        } as StatValueEntry)
    );

    const finalDifficultyLevel = difficultyLevel || setup.difficultyLevel;

    const initialState: StoryState = {
      id: gameId,
      title: setup.title,
      imageInstructions: setup.imageInstructions,
      gameMode,
      difficultyLevel: finalDifficultyLevel,
      guidelines: setup.guidelines,
      storyElements: setup.storyElements,
      worldFacts: [],
      sharedOutcomes: setup.sharedOutcomes,
      sharedStats: setup.sharedStats,
      sharedStatValues: sharedStatValues,
      playerStats: setup.playerStats,
      players,
      storyPhases: [],
      maxTurns,
      characterSelectionCompleted: false,
      characterSelectionOptions: Object.fromEntries(
        getPlayerSlots(playerCount).map((slot) => {
          const playerKey = slot as keyof StorySetupGeneration<
            typeof playerCount
          >;
          return [slot, setup[playerKey] as PlayerOptionsGeneration];
        })
      ),
      characterSelectionIntroduction: setup.characterSelectionIntroduction,
      generateImages,
      images: [],
      playerCodes: {},
    };

    // Create a Story instance to ensure proper state management
    const story = Story.create(initialState);
    return story.getState();
  }

  private createPlayersFromSetup(
    setup: StorySetupGeneration<PlayerCount>,
    playerCount: PlayerCount
  ): Record<string, PlayerState> {
    return Object.fromEntries(
      getPlayerSlots(playerCount).map((slot) => {
        const playerKey = slot as keyof StorySetupGeneration<
          typeof playerCount
        >;
        const playerData = setup[playerKey] as PlayerOptionsGeneration;

        // Create minimal PlayerState with only outcomes defined using the reusable function
        return [slot, createEmptyPlayerState(playerData.outcomes)];
      })
    );
  }

  async generateStorySetup(
    prompt: string,
    playerCount: PlayerCount,
    gameMode: GameMode,
    maxTurns: number
  ): Promise<StorySetupGeneration<typeof playerCount>> {
    // Create a filename based on the parameters
    const mockStoriesEnabled =
      process.env.NODE_ENV === "development" && MOCK_STORIES_IN_DEVELOPMENT;
    const mockFilename = `story_setup_${playerCount}_${gameMode}.json`;

    // If mock stories are enabled, try to read from file
    if (mockStoriesEnabled) {
      Logger.Story.log(
        `Using mock story setup with playerCount: ${playerCount}, gameMode: ${gameMode}`
      );

      // Simulate API delay
      await new Promise((resolve) =>
        setTimeout(resolve, MOCK_STORIES_DELAY_MS)
      );

      try {
        // Try to read the mock file
        const mockData = await readStorageFile("mocks", mockFilename);
        Logger.Story.log(`Reading mock story from ${mockFilename}`);
        return JSON.parse(mockData) as StorySetupGeneration<typeof playerCount>;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          Logger.Story.log(
            `Mock file ${mockFilename} not found. Generating new story.`
          );
        } else {
          Logger.Story.error(`Error reading mock file: ${error}`);
        }
      }
    }

    // Generate a new story setup using the LLM
    const schema = createStorySetupSchema(playerCount);
    const structuredModel = this.generationModel.withStructuredOutput(schema);

    try {
      Logger.Story.log(
        `Generating story setup with playerCount: ${playerCount}`
      );

      const setupPrompt = StorySetupPromptService.createSetupPrompt(
        prompt,
        playerCount,
        gameMode,
        maxTurns
      );

      const result = await structuredModel.invoke(setupPrompt);
      Logger.Story.log("Raw response:", JSON.stringify(result, null, 2));

      // If mock stories are enabled, save the result to a file for later use
      if (mockStoriesEnabled) {
        try {
          await writeStorageFile(
            "mocks",
            mockFilename,
            JSON.stringify(result, null, 2)
          );
          Logger.Story.log(`Saved mock story to ${mockFilename}`);
        } catch (error) {
          Logger.Story.error(`Error saving mock file: ${error}`);
        }
      }

      // Create a new object without the characterSelectionPlan property
      const { characterSelectionPlan, ...storySetupData } = result;

      return storySetupData as StorySetupGeneration<typeof playerCount>;
    } catch (error) {
      Logger.Story.error("Failed to initialize story:", error);
      throw new Error("Failed to initialize story. Please try again.");
    }
  }

  async generateSwitches(story: Story): Promise<Story> {
    const schema = createSwitchAnalysisSchema(
      Object.keys(story.getPlayers()).length as PlayerCount
    );
    const structuredModel = this.switchThreadModel.withStructuredOutput(schema);
    const prompt = SwitchPromptService.createSwitchAnalysisPrompt(story);

    const response = (await structuredModel.invoke(prompt)) as SwitchAnalysis;
    Logger.Story.log(JSON.stringify(response, null, 2));

    const currentBeatIndex = story.getCurrentTurn() - 1;
    const firstBeatIndexOfSwitch = currentBeatIndex + 1;

    // Create the transformed SwitchAnalysis
    const transformedResponse: SwitchAnalysis = {
      ...response,
      firstBeatIndex: firstBeatIndexOfSwitch,
      duration: 1,
    };

    return story.addPhase(transformedResponse);
  }

  async generateThreads(story: Story): Promise<Story> {
    const schema = threadAnalysisSchema;
    const structuredModel = this.switchThreadModel.withStructuredOutput(schema);
    const prompt = ThreadPromptService.createThreadPrompt(story);

    const response = (await structuredModel.invoke(prompt)) as ThreadAnalysis;
    Logger.Story.log(JSON.stringify(response, null, 2));

    const currentBeatIndex = story.getCurrentTurn() - 1;
    const firstBeatIndexOfThread = currentBeatIndex + 1;

    // Transform the threads to include the new properties
    const transformedThreads = response.threads.map((thread) => {
      // Transform each ThreadStep to include resolution
      const transformedSteps = thread.progression.map((step) => ({
        ...step,
        resolution: null,
      }));

      // Transform the Thread to include the new properties
      return {
        ...thread,
        firstBeatIndex: firstBeatIndexOfThread,
        duration: response.duration,
        progression: transformedSteps,
        resolution: null,
        milestone: null,
      };
    });

    // Create the transformed ThreadAnalysis
    const transformedResponse: ThreadAnalysis = {
      ...response,
      firstBeatIndex: firstBeatIndexOfThread,
      threads: transformedThreads,
    };

    // Modify players' previousTypesOfThreads to include the new thread type
    let updatedStory =
      story.updatePlayerPreviousThreadTypes(transformedThreads);

    // Add the phase to the updated story
    return updatedStory.addPhase(transformedResponse);
  }

  async generateBeats(
    story: Story
  ): Promise<[Story, Change[], ImageRequest[]]> {
    try {
      const response = await this.generateBeatsResponse(story);
      const [updatedStory, imageRequests] = this.processBeatsResponse(
        story,
        response
      );
      const mergedChanges = this.mergeChanges(response);

      return [updatedStory, mergedChanges, imageRequests];
    } catch (error) {
      Logger.Story.error("Failed to generate next beats:", error);
      throw new Error("Failed to generate next beats. Please try again.");
    }
  }

  private async generateBeatsResponse(
    story: Story
  ): Promise<SetOfBeatGenerationSchema> {
    const schema = createSetOfBeatGenerationSchema(
      story.getNumberOfPlayers(),
      // canAddMilestones = true only if it's the ending or (a switch and not the beginning of the story)
      story.getCurrentBeatType() === "ending" ||
        (story.getCurrentBeatType() === "switch" && !story.isFirstBeat()),
      // multiplayerCoordination = true only if it's a multiplayer game
      story.isMultiplayer(),
      // Pass the generateImages flag from the story
      story.generatesImages(),
      // Pass the hasImages flag from the story
      story.hasImages()
    );
    const structuredModel = this.textModel.withStructuredOutput(schema);

    Logger.Story.log(
      `Generating beats for turn: ${story.getCurrentTurn() + 1}`
    );

    const response = (await structuredModel.invoke(
      BeatPromptService.createBeatPrompt(story)
    )) as SetOfBeatGenerationSchema;

    Logger.Story.log(JSON.stringify(response, null, 2));
    return response;
  }

  async generateEnding(story: Story): Promise<Story> {
    // TODO: Generate ending
    return story;
  }

  private processBeatsResponse(
    story: Story,
    response: SetOfBeatGenerationSchema
  ): [Story, ImageRequest[]] {
    let updatedStory = story.clone();
    const imageRequests: ImageRequest[] = [];

    Object.entries(response).forEach(([key, value]) => {
      if (this.isPlayerBeat(key)) {
        const playerSlot = key.toLowerCase();
        const beatData = value as BeatGeneration;

        if (updatedStory.getPlayer(playerSlot)) {
          const beat: Beat = {
            ...beatData,
            choice: -1,
            resolution: null,
          };

          updatedStory = updatedStory.addBeatToPlayer(playerSlot, beat);

          // If the imageRequest is an object, add it to the imageRequests array
          // Only collect image requests if generateImages is true
          if (
            story.generatesImages() &&
            beat.imageRequest &&
            typeof beat.imageRequest === "object"
          ) {
            imageRequests.push(beat.imageRequest as ImageRequest);
          }
        } else {
          throw new Error(
            `Player ${playerSlot} not found in story. This should never happen.`
          );
        }
      }
    });

    return [updatedStory, imageRequests];
  }

  private isPlayerBeat(key: string): boolean {
    return PLAYER_SLOTS.includes(key.toLowerCase());
  }

  private mergeChanges(response: SetOfBeatGenerationSchema): Change[] {
    const playerBeats = Object.entries(response)
      .filter(([key]) => this.isPlayerBeat(key))
      .map(([_, value]) => value as BeatGeneration);

    const allEstablishedFacts = playerBeats.flatMap(
      (beat) => beat.plan.establishedFacts || []
    );
    const allNewGameElements = playerBeats.flatMap(
      (beat) => beat.plan.newGameElements || []
    );
    const allNewIntroductions = playerBeats.flatMap(
      (beat) => beat.plan.newIntroductionsOfStoryElements || []
    );

    return [
      ...(response.statChanges || []),
      ...(response.newMilestones || []),
      ...allEstablishedFacts,
      ...allNewGameElements,
      ...allNewIntroductions,
    ];
  }

  /**
   * Generates updated sections for an existing template
   * @param prompt The iteration prompt
   * @param sections Array of sections to regenerate
   * @param playerCount Player count for the story
   * @returns Partial template update with only the requested sections
   */
  async generatePartialTemplateUpdate(
    prompt: string,
    sections: string[],
    playerCount: PlayerCount
  ): Promise<Partial<StorySetupGeneration<typeof playerCount>>> {
    try {
      Logger.Story.log(
        "Generating partial template update for sections:",
        sections
      );

      // Get the full schema
      const fullSchema = createStorySetupSchema(playerCount, "template");
      const shapeEntries = Object.entries(fullSchema.shape);

      // Set to track fields to keep
      const fieldsToKeep = new Set<string>();
      // Add fields based on requested sections using templateIterationSections
      for (const section of sections) {
        if (section in templateIterationSections) {
          const sectionFields =
            templateIterationSections[
              section as keyof typeof templateIterationSections
            ];
          sectionFields.forEach((field) => fieldsToKeep.add(field));
        }
      }
      // Special handling for player fields to match current playerCount
      if (sections.includes("players")) {
        // Add correct player fields for the current playerCount
        for (let i = 1; i <= playerCount; i++) {
          fieldsToKeep.add(`player${i}`);
        }
      }
      Logger.Story.log("Fields to keep:", Array.from(fieldsToKeep));

      // Filter the shape entries to only include fields we want to keep
      const filteredShapeEntries = shapeEntries.filter(([key]) =>
        fieldsToKeep.has(key)
      );
      // Create a new schema with just the fields we want
      const filteredShape = Object.fromEntries(filteredShapeEntries);
      const partialSchema = z.object(filteredShape);

      // Create a structured model with the partial schema
      const structuredModel =
        this.generationModel.withStructuredOutput(partialSchema);
      const result = await structuredModel.invoke(prompt);

      Logger.Story.log("Result:", JSON.stringify(result, null, 2));
      Logger.Story.log("Partial template update generated");

      return result;
    } catch (error) {
      Logger.Story.error("Failed to generate partial template update:", error);
      throw new Error("Failed to generate template updates. Please try again.");
    }
  }
}
