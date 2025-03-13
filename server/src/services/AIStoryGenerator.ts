import { ChatOpenAI } from "@langchain/openai";
import type {
  StoryState,
  StorySetup,
  PlayerStateGeneration,
} from "shared/types/story.js";
import type { Change } from "shared/types/change.js";
import type {
  Beat,
  BeatGeneration,
  SetOfBeatGenerationSchema,
} from "shared/types/beat.js";
import dotenv from "dotenv";
import { createStorySetupSchema } from "shared/types/story.js";
import {
  createSwitchAnalysisSchema,
  type SwitchAnalysis,
} from "shared/types/switch.js";
import {
  type ThreadAnalysis,
  threadAnalysisSchema,
} from "shared/types/thread.js";
import type { PlayerCount } from "shared/types/player.js";
import { getPlayerSlots } from "shared/utils/playerUtils.js";
import { createSetOfBeatGenerationSchema } from "shared/types/beat.js";
import type { BeatsNeedingImages } from "shared/types/image.js";
import { type GameMode } from "shared/types/story.js";
import { StorySetupPromptService } from "./prompts/StorySetupPromptService.js";
import { SwitchPromptService } from "./prompts/SwitchPromptService.js";
import { ThreadPromptService } from "./prompts/ThreadPromptService.js";
import { BeatPromptService } from "./prompts/BeatPromptService.js";
import { PLAYER_SLOTS } from "shared/types/player.js";
import { Story } from "./Story.js";
dotenv.config();

export class AIStoryGenerator {
  private model: ChatOpenAI;

  constructor() {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY environment variable is not set");
    }

    this.model = new ChatOpenAI({
      // modelName: "o3-mini",
      // reasoningEffort: "high", // low, medium, high
      modelName: "gpt-4o",
      temperature: 0.4,
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

    return {
      gameMode,
      guidelines: setup.guidelines,
      storyElements: setup.storyElements,
      worldFacts: [],
      sharedOutcomes: setup.sharedOutcomes,
      sharedStats: setup.sharedStats,
      players,
      storyPhases: [],
      maxTurns,
      generateImages,
      images: [],
      playerCodes: {},
    };
  }

  private createPlayersFromSetup(
    setup: StorySetup<PlayerCount>,
    playerCount: PlayerCount
  ) {
    return Object.fromEntries(
      getPlayerSlots(playerCount).map((slot) => {
        const playerKey = slot as keyof StorySetup<typeof playerCount>;
        const playerData = setup[playerKey] as PlayerStateGeneration;
        return [
          slot,
          {
            character: playerData.character,
            outcomes: playerData.outcomes,
            characterStats: playerData.characterStats,
            knownStoryElements: [],
            beatHistory: [],
          },
        ];
      })
    );
  }

  async generateStorySetup(
    prompt: string,
    playerCount: PlayerCount,
    gameMode: GameMode,
    maxTurns: number
  ): Promise<StorySetup<typeof playerCount>> {
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

      const response = await structuredModel.invoke(setupPrompt);
      console.log("Raw response:", JSON.stringify(response, null, 2));

      return response as StorySetup<typeof playerCount>;
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

    // Create the transformed ThreadAnalysis
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

    return story.addPhase(transformedResponse);
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
}
