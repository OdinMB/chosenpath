import dotenv from "dotenv";
import { ChatOpenAI } from "@langchain/openai";
// import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import type {
  StoryState,
  StorySetupGeneration,
  TemplateSetupGeneration,
  PlayerOptionsGeneration,
  Change,
  SetOfBeatGenerationSchema,
  ImageRequest,
  PlayerCount,
  GameMode,
  DifficultyLevel,
  StatValueEntry,
} from "core/types/index.js";
import { PlayerState } from "core/types/index.js";
import { Logger } from "shared/logger.js";
import { getPlayerSlots } from "core/utils/playerUtils.js";
import { Story } from "core/models/Story.js";
import {
  MOCK_STORIES_IN_DEVELOPMENT,
  MOCK_STORIES_DELAY_MS,
} from "core/config.js";
import { productionTextModels } from "server/config.js";
import {
  createChatModel,
  PRODUCTION_MAX_RETRIES,
  productionCallLimits,
} from "shared/llm/chatModel.js";
import { settingsFor, type TextRole } from "shared/llm/textModelSettings.js";
import { llmCallLogger, type CallTags } from "shared/llm/usageRecorder.js";
import { readStorageFile, writeStorageFile } from "shared/storageUtils.js";
import { createEmptyPlayerState } from "./StoryStateFactory.js";
import { repairBeatReply } from "./beatRepairs.js";
import { checkedSwitchPlan, checkedThreadPlan } from "./planChecks.js";
import { logRepairs } from "./textRepairs.js";
import {
  beatStep,
  setupStep,
  switchStep,
  threadStep,
  type TextRequest,
} from "./storyTextSteps.js";
import type { SetupPromptOptions } from "./prompts/StorySetupPromptService.js";
import type { z } from "zod";

dotenv.config();

/** Whether a call belongs to a background pregeneration (reaches the call logs only). */
export type GenerationContext = { pregeneration: boolean };

/** Story tags for the per-call log: ids and numbers, never text. */
function storyTags(
  story: Story,
  context: GenerationContext | undefined,
  beatType?: string
): CallTags {
  return {
    storyId: story.getId(),
    turn: story.getCurrentTurn() + 1,
    players: story.getNumberOfPlayers(),
    beatType,
    images: story.generatesImages(),
    pregeneration: context?.pregeneration ?? false,
  };
}

export class AIStoryGenerator {
  /** One model per role, resolved settings and limits, created on first use */
  private models = new Map<string, ChatOpenAI>();

  constructor() {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY environment variable is not set");
    }
  }

  /** The role's model for this many players: multiplayer settings above one, and the output cap by player count. */
  private modelFor(role: TextRole, players: number): ChatOpenAI {
    const settings = settingsFor(productionTextModels(), role, {
      multiplayer: players > 1,
    });
    const limits = productionCallLimits(role, players);
    const key = `${role}|${JSON.stringify(settings)}|${JSON.stringify(limits)}`;
    let model = this.models.get(key);
    if (!model) {
      model = createChatModel({
        role,
        settings,
        maxRetries: PRODUCTION_MAX_RETRIES,
        ...limits,
        callbacks: [llmCallLogger],
      });
      this.models.set(key, model);
    }
    return model;
  }

  public async createInitialState(
    gameId: string,
    prompt: string,
    generateImages: boolean,
    playerCount: PlayerCount,
    maxTurns: number,
    gameMode: GameMode,
    difficultyLevel: DifficultyLevel | undefined,
    options: SetupPromptOptions = {}
  ): Promise<StoryState> {
    const setup = await this.generateStorySetup(
      prompt,
      playerCount,
      gameMode,
      maxTurns,
      options
    );

    const players = this.createPlayersFromSetup(setup, playerCount);

    const sharedStatValues = setup.sharedStats.map(
      (stat) =>
        ({
          statId: stat.id,
          value: stat.initialValue,
        } as StatValueEntry)
    );

    // Prefer user-provided difficulty if given; otherwise use AI-provided from setup
    let finalDifficultyLevel = difficultyLevel || setup.difficultyLevel;
    // Safety: if AI provided an out-of-range modifier, normalize to default Balanced
    if (!difficultyLevel) {
      const allowedModifiers = new Set([-20, -10, 0, 10, 20]);
      if (!allowedModifiers.has(finalDifficultyLevel.modifier)) {
        Logger.Story.warn(
          `AI provided invalid difficulty modifier (${finalDifficultyLevel.modifier}). Falling back to Balanced (0).`
        );
        finalDifficultyLevel = { modifier: 0, title: "Balanced" };
      }
    }

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
      pregenerateBeats: false, // Default to false - will be set by client/user preference
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

  async generateTemplateSetup(
    prompt: string,
    playerCount: PlayerCount,
    gameMode: GameMode,
    maxTurns: number
  ): Promise<TemplateSetupGeneration<typeof playerCount>> {
    const request = setupStep.request(
      prompt,
      playerCount,
      gameMode,
      maxTurns,
      "template"
    );
    const structuredModel = this.modelFor(
      "templateGeneration",
      playerCount
    ).withStructuredOutput(request.schema);

    try {
      Logger.Story.log(
        `Generating template setup with playerCount: ${playerCount}`
      );

      const result = await structuredModel.invoke(request.prompt, {
        metadata: { players: playerCount },
      });
      Logger.Story.log("Template setup generated");

      // Written in the generation order; put back into the fields saved today
      // (the seat roles land in the plan, which is not kept after generation)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { characterSelectionPlan, ...templateSetupData } = request.assemble(result);

      return templateSetupData as unknown as TemplateSetupGeneration<typeof playerCount>;
    } catch (error) {
      Logger.Story.error("Failed to initialize template:", error);
      throw new Error("Failed to initialize template. Please try again.");
    }
  }

  async generateStorySetup(
    prompt: string,
    playerCount: PlayerCount,
    gameMode: GameMode,
    maxTurns: number,
    options: SetupPromptOptions = {}
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
    const request = setupStep.request(
      prompt,
      playerCount,
      gameMode,
      maxTurns,
      "story",
      options
    );
    const structuredModel = this.modelFor(
      "setup",
      playerCount
    ).withStructuredOutput(request.schema);

    try {
      Logger.Story.log(
        `Generating story setup with playerCount: ${playerCount}`
      );

      // Written in the generation order; put back into the fields saved today before anything reads it
      const result = request.assemble(
        await structuredModel.invoke(request.prompt, {
          metadata: { players: playerCount },
        })
      );
      Logger.Story.log("Story setup generated");

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

      // The character-selection plan (with the seat roles) is not kept after generation
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { characterSelectionPlan, ...storySetupData } = result;

      return storySetupData as unknown as StorySetupGeneration<typeof playerCount>;
    } catch (error) {
      Logger.Story.error("Failed to initialize story:", error);
      throw new Error("Failed to initialize story. Please try again.");
    }
  }

  async generateSwitches(
    story: Story,
    context?: GenerationContext
  ): Promise<Story> {
    const request = switchStep.request(story);
    const structuredModel = this.modelFor(
      "switchAnalysis",
      story.getNumberOfPlayers()
    ).withStructuredOutput(request.schema);

    // The lean reply as the plan the story stores, checked before it becomes the story: repaired, or asked for once more
    const plan = await checkedSwitchPlan(story, request.prompt, async (prompt) =>
      request.assemble(
        await structuredModel.invoke(prompt, {
          metadata: storyTags(story, context),
        })
      )
    );
    Logger.Story.log("Switches generated");

    return switchStep.apply(story, plan);
  }

  async generateThreads(
    story: Story,
    context?: GenerationContext
  ): Promise<Story> {
    const request = threadStep.request(story);
    const structuredModel = this.modelFor(
      "threadAnalysis",
      story.getNumberOfPlayers()
    ).withStructuredOutput(request.schema);

    // The lean reply as the plan the story stores (a single player's pick sets its outcome),
    // checked before it becomes the story: repaired, or asked for once more
    const plan = await checkedThreadPlan(story, request.prompt, async (prompt) =>
      request.assemble(
        await structuredModel.invoke(prompt, {
          metadata: storyTags(story, context),
        })
      )
    );
    Logger.Story.log("Threads generated");

    return threadStep.apply(story, plan);
  }

  async generateBeats(
    story: Story,
    skipImageRequests: boolean = false,
    context?: GenerationContext
  ): Promise<[Story, Change[], ImageRequest[]]> {
    try {
      const response = await this.generateBeatsResponse(story, context);
      // Put what the reply wrote where the game reads it, before the beats are stored
      const { reply, repairs } = repairBeatReply(story, response);
      logRepairs("beat", story, repairs);
      return beatStep.apply(story, reply, skipImageRequests);
    } catch (error) {
      Logger.Story.error("Failed to generate next beats:", error);
      throw new Error("Failed to generate next beats. Please try again.");
    }
  }

  private async generateBeatsResponse(
    story: Story,
    context?: GenerationContext
  ): Promise<SetOfBeatGenerationSchema> {
    const request = beatStep.request(story);
    const structuredModel = this.modelFor(
      "beat",
      story.getNumberOfPlayers()
    ).withStructuredOutput(request.schema);

    Logger.Story.log(
      `Generating beats for turn: ${story.getCurrentTurn() + 1}`
    );

    const response = (await structuredModel.invoke(request.prompt, {
      metadata: storyTags(story, context, story.getCurrentBeatType()),
    })) as SetOfBeatGenerationSchema;

    Logger.Story.log("Beats generated");
    return response;
  }

  async generateEnding(story: Story): Promise<Story> {
    // TODO: Generate ending
    return story;
  }

  /**
   * Generates updated sections for an existing template
   * @param request The iteration request (iterationStep.request): its prompt and the schema cut to the sections
   * @param sections Array of sections to regenerate
   * @param playerCount Player count for the story
   * @returns Partial template update with only the requested sections
   */
  async generatePartialTemplateUpdate(
    request: TextRequest<z.ZodObject<z.ZodRawShape>>,
    sections: string[],
    playerCount: PlayerCount
  ): Promise<Partial<StorySetupGeneration<typeof playerCount>>> {
    try {
      Logger.Story.log(
        "Generating partial template update for sections:",
        sections
      );
      Logger.Story.log("Fields to keep:", Object.keys(request.schema.shape));

      const structuredModel = this.modelFor(
        "templateIteration",
        playerCount
      ).withStructuredOutput(request.schema);
      const result = await structuredModel.invoke(request.prompt, {
        metadata: { players: playerCount },
      });

      // Logger.Story.log("Result:", JSON.stringify(result, null, 2));
      Logger.Story.log("Partial template update generated");

      return result;
    } catch (error) {
      Logger.Story.error("Failed to generate partial template update:", error);
      throw new Error("Failed to generate template updates. Please try again.");
    }
  }
}
