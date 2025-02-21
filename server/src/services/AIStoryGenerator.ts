import { ChatOpenAI } from "@langchain/openai";
import type {
  StoryState,
  StorySetup,
  PlayerStateGeneration,
} from "../../../shared/types/story.js";
import type { Change } from "../../../shared/types/change.js";
import type {
  Beat,
  BeatGeneration,
  SetOfBeatGenerationSchema,
} from "../../../shared/types/beat.js";
import dotenv from "dotenv";
import { createStorySetupSchema } from "../../../shared/types/story.js";
import {
  createSwitchAnalysisSchema,
  type SwitchAnalysis,
} from "../../../shared/types/switch.js";
import {
  type ThreadAnalysis,
  threadAnalysisSchema,
} from "../../../shared/types/thread.js";
import type { PlayerCount } from "../../../shared/types/players.js";
import { getPlayerSlots } from "../../../shared/utils/playerUtils.js";
import { createSetOfBeatGenerationSchema } from "../../../shared/types/beat.js";
import type { BeatsNeedingImages } from "../../../shared/types/image.js";
import { type GameMode } from "../../../shared/types/story.js";
import type { StoryElement } from "../../../shared/types/storyElement.js";
import { StorySetupPromptService } from "./prompts/StorySetupPromptService.js";
import { SwitchPromptService } from "./prompts/SwitchPromptService.js";
import { ThreadPromptService } from "./prompts/ThreadPromptService.js";
import { BeatPromptService } from "./prompts/BeatPromptService.js";
import { PLAYER_SLOTS } from "../../../shared/types/players.js";
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
    const storyElements: StoryElement[] = setup.storyElements.map(
      (element) => ({
        ...element,
        facts: [],
      })
    );

    return {
      gameMode,
      guidelines: setup.guidelines,
      storyElements,
      worldFacts: [],
      sharedOutcomes: setup.sharedOutcomes,
      sharedStats: setup.sharedStats,
      players,
      maxTurns,
      currentBeatType: "intro",
      currentSwitchAnalysis: null,
      currentThreadAnalysis: null,
      currentThreadMaxBeats: 0,
      currentThreadBeatsCompleted: 0,
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

  async generateSwitches(state: StoryState): Promise<StoryState> {
    const schema = createSwitchAnalysisSchema(
      Object.keys(state.players).length as PlayerCount
    );
    const structuredModel = this.model.withStructuredOutput(schema);
    const prompt = SwitchPromptService.createSwitchAnalysisPrompt(state);

    const response = (await structuredModel.invoke(prompt)) as SwitchAnalysis;
    console.log("Response:\n", JSON.stringify(response, null, 2));

    return { ...state, currentSwitchAnalysis: response };
  }

  async generateThreads(state: StoryState): Promise<StoryState> {
    const schema = threadAnalysisSchema;
    const structuredModel = this.model.withStructuredOutput(schema);
    const prompt = ThreadPromptService.createThreadPrompt(state);

    const response = (await structuredModel.invoke(prompt)) as ThreadAnalysis;
    console.log("Response:\n", JSON.stringify(response, null, 2));

    return {
      ...state,
      currentThreadAnalysis: response,
      currentThreadMaxBeats: response.duration,
    };
  }

  async generateBeats(
    state: StoryState
  ): Promise<[StoryState, Change[], BeatsNeedingImages]> {
    try {
      const response = await this.generateBeatsResponse(state);
      const [updatedState, beatsNeedingImages] = this.processBeatsResponse(
        state,
        response
      );
      const mergedChanges = this.mergeChanges(response);

      return [updatedState, mergedChanges, beatsNeedingImages];
    } catch (error) {
      console.error("Failed to generate next beats:", error);
      throw new Error("Failed to generate next beats. Please try again.");
    }
  }

  private async generateBeatsResponse(
    state: StoryState
  ): Promise<SetOfBeatGenerationSchema> {
    const schema = createSetOfBeatGenerationSchema(
      Object.keys(state.players).length as PlayerCount
    );
    const structuredModel = this.model.withStructuredOutput(schema);

    console.log(
      "Generating beats for turn:",
      Object.values(state.players)[0].beatHistory.length + 1
    );

    const response = (await structuredModel.invoke(
      BeatPromptService.createBeatPrompt(state)
    )) as SetOfBeatGenerationSchema;

    console.log("Response:\n", JSON.stringify(response, null, 2));
    return response;
  }

  private processBeatsResponse(
    state: StoryState,
    response: SetOfBeatGenerationSchema
  ): [StoryState, BeatsNeedingImages] {
    const updatedState = { ...state };
    const beatsNeedingImages: BeatsNeedingImages = {};

    Object.entries(response).forEach(([key, value]) => {
      if (this.isPlayerBeat(key)) {
        const playerSlot = key.toLowerCase();
        const beatData = value as BeatGeneration;

        if (updatedState.players[playerSlot]) {
          this.addBeatToPlayer(
            updatedState,
            beatsNeedingImages,
            playerSlot,
            beatData
          );
        }
      }
    });

    return [updatedState, beatsNeedingImages];
  }

  private isPlayerBeat(key: string): boolean {
    return PLAYER_SLOTS.includes(key.toLowerCase());
  }

  private addBeatToPlayer(
    state: StoryState,
    beatsNeedingImages: BeatsNeedingImages,
    playerSlot: string,
    beatData: BeatGeneration
  ): void {
    if (!beatData.imageId || beatData.imageId === "") {
      beatsNeedingImages[playerSlot] = {
        ...beatData,
        choice: -1,
      };
    }

    const beat: Beat = {
      ...beatData,
      choice: -1,
    };
    state.players[playerSlot].beatHistory.push(beat);
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
      ...(response.decisionConsequences || []),
      ...allEstablishedFacts,
      ...allNewGameElements,
      ...allNewIntroductions,
    ];
  }
}
