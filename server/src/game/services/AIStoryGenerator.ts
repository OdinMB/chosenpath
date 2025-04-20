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
  SwitchAnalysis,
  ThreadAnalysis,
  PlayerCount,
  BeatsNeedingImages,
  GameMode,
  Thread,
} from "@core/types/index.js";
import {
  createStorySetupSchema,
  createSwitchAnalysisSchema,
  threadAnalysisSchema,
  PLAYER_SLOTS,
  PlayerState,
  getThreadType,
} from "@core/types/index.js";
import { getPlayerSlots } from "@core/utils/playerUtils.js";
import { createSetOfBeatGenerationSchema } from "@core/types/beat.js";
import { StorySetupPromptService } from "./prompts/StorySetupPromptService.js";
import { SwitchPromptService } from "./prompts/SwitchPromptService.js";
import { ThreadPromptService } from "./prompts/ThreadPromptService.js";
import { BeatPromptService } from "./prompts/BeatPromptService.js";
import { Story } from "@core/models/Story.js";
import {
  MOCK_STORIES_IN_DEVELOPMENT,
  MOCK_STORIES_DELAY_MS,
} from "@core/config.js";
import { TEXT_MODEL_NAME, TEXT_MODEL_TEMPERATURE } from "@/config.js";
import { readStorageFile, writeStorageFile } from "@common/storageUtils.js";
import { createEmptyPlayerState } from "./StoryStateFactory.js";

dotenv.config();

export class AIStoryGenerator {
  private model: ChatOpenAI;

  constructor() {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY environment variable is not set");
    }

    this.model = new ChatOpenAI({
      modelName: TEXT_MODEL_NAME as string,
      temperature: TEXT_MODEL_TEMPERATURE as number,
    });
  }

  public async createInitialState(
    prompt: string,
    generateImages: boolean,
    playerCount: PlayerCount,
    maxTurns: number,
    gameMode: GameMode
  ): Promise<StoryState> {
    const setup = await this.generateStorySetup(
      prompt,
      playerCount,
      gameMode,
      maxTurns
    );

    const players = this.createPlayersFromSetup(setup, playerCount);

    const initialState: StoryState = {
      title: setup.title,
      gameMode,
      guidelines: setup.guidelines,
      storyElements: setup.storyElements,
      worldFacts: [],
      sharedOutcomes: setup.sharedOutcomes,
      sharedStats: setup.sharedStats,
      sharedStatValues: setup.initialSharedStatValues,
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
      console.log(
        `Using mock story setup with playerCount: ${playerCount}, gameMode: ${gameMode}`
      );

      // Simulate API delay
      await new Promise((resolve) =>
        setTimeout(resolve, MOCK_STORIES_DELAY_MS)
      );

      try {
        // Try to read the mock file
        const mockData = await readStorageFile("mocks", mockFilename);
        console.log(`Reading mock story from ${mockFilename}`);
        return JSON.parse(mockData) as StorySetupGeneration<typeof playerCount>;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          console.log(
            `Mock file ${mockFilename} not found. Generating new story.`
          );
        } else {
          console.error(`Error reading mock file: ${error}`);
        }
      }
    }

    // Generate a new story setup using the LLM
    const schema = createStorySetupSchema(playerCount);
    const structuredModel = this.model.withStructuredOutput(schema);

    try {
      console.log("Generating story setup with playerCount:", playerCount);

      const setupPrompt = StorySetupPromptService.createSetupPrompt(
        prompt,
        playerCount,
        gameMode,
        maxTurns
      );

      const result = await structuredModel.invoke(setupPrompt);
      console.log("Raw response:", JSON.stringify(result, null, 2));

      // If mock stories are enabled, save the result to a file for later use
      if (mockStoriesEnabled) {
        try {
          await writeStorageFile(
            "mocks",
            mockFilename,
            JSON.stringify(result, null, 2)
          );
          console.log(`Saved mock story to ${mockFilename}`);
        } catch (error) {
          console.error(`Error saving mock file: ${error}`);
        }
      }

      // Create a new object without the characterSelectionPlan property
      const { characterSelectionPlan, ...storySetupData } = result;

      return storySetupData as StorySetupGeneration<typeof playerCount>;
    } catch (error) {
      console.error("Failed to initialize story:", error);
      throw new Error("Failed to initialize story. Please try again.");
    }
  }

  async generateSwitches(story: Story): Promise<Story> {
    const schema = createSwitchAnalysisSchema(
      Object.keys(story.getPlayers()).length as PlayerCount
    );
    const structuredModel = this.model.withStructuredOutput(schema);
    const prompt = SwitchPromptService.createSwitchAnalysisPrompt(story);

    const response = (await structuredModel.invoke(prompt)) as SwitchAnalysis;
    console.log("Response:\n", JSON.stringify(response, null, 2));

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
    const structuredModel = this.model.withStructuredOutput(schema);
    const prompt = ThreadPromptService.createThreadPrompt(story);

    const response = (await structuredModel.invoke(prompt)) as ThreadAnalysis;
    console.log("Response:\n", JSON.stringify(response, null, 2));

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
  ): Promise<[Story, Change[], BeatsNeedingImages]> {
    try {
      const response = await this.generateBeatsResponse(story);
      const [updatedStory, beatsNeedingImages] = this.processBeatsResponse(
        story,
        response
      );
      const mergedChanges = this.mergeChanges(response);

      return [updatedStory, mergedChanges, beatsNeedingImages];
    } catch (error) {
      console.error("Failed to generate next beats:", error);
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
      story.isMultiplayer()
    );
    const structuredModel = this.model.withStructuredOutput(schema);

    console.log("Generating beats for turn:", story.getCurrentTurn() + 1);

    const response = (await structuredModel.invoke(
      BeatPromptService.createBeatPrompt(story)
    )) as SetOfBeatGenerationSchema;

    console.log("Response:\n", JSON.stringify(response, null, 2));
    return response;
  }

  async generateEnding(story: Story): Promise<Story> {
    // TODO: Generate ending
    return story;
  }

  private processBeatsResponse(
    story: Story,
    response: SetOfBeatGenerationSchema
  ): [Story, BeatsNeedingImages] {
    let updatedStory = story.clone();
    const beatsNeedingImages: BeatsNeedingImages = {};

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

          if (!beatData.imageId || beatData.imageId === "") {
            beatsNeedingImages[playerSlot] = beat;
          }
        } else {
          throw new Error(
            `Player ${playerSlot} not found in story. This should never happen.`
          );
        }
      }
    });

    return [updatedStory, beatsNeedingImages];
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
      console.log("Generating partial template update for sections:", sections);

      // Create a partial schema based on the requested sections
      const fullSchema = createStorySetupSchema(playerCount);

      // Create a subset of the schema with only the requested fields
      // This uses zod's pick method to select specific sections of the schema
      const partialSchema = fullSchema.pick(
        sections.reduce((acc, section) => {
          // Handle special cases for grouped sections
          if (section === "stats") {
            return {
              ...acc,
              statGroups: true,
              sharedStats: true,
              playerStats: true,
              initialSharedStatValues: true,
            };
          }
          if (section === "players") {
            // For players, we need to include player1, player2, etc. based on playerCount
            const playerFields = Object.fromEntries(
              Array.from({ length: playerCount }, (_, i) => [
                `player${i + 1}`,
                true,
              ])
            );
            return {
              ...acc,
              ...playerFields,
              characterSelectionIntroduction: true,
            };
          }
          return { ...acc, [section]: true };
        }, {})
      );

      const structuredModel = this.model.withStructuredOutput(partialSchema);
      const result = await structuredModel.invoke(prompt);

      console.log(
        "Partial template update generated:",
        JSON.stringify(result, null, 2)
      );
      return result;
    } catch (error) {
      console.error("Failed to generate partial template update:", error);
      throw new Error("Failed to generate template updates. Please try again.");
    }
  }
}
