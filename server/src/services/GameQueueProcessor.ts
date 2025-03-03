import { BaseQueueProcessor } from "./QueueProcessor.js";
import type {
  GameOperation,
  StoryUpdateEvent,
  OperationErrorEvent,
} from "../types/queue.js";
import type { PlayerSlot } from "shared/types/player.js";
import { AIStoryGenerator } from "./AIStoryGenerator.js";
import { AIImageGenerator } from "./AIImageGenerator.js";
import { OutcomeService } from "../services/OutcomeService.js";
import { Story } from "./Story.js";

export interface QueueEvents {
  storyUpdated: (event: StoryUpdateEvent) => void;
  operationError: (event: OperationErrorEvent) => void;
  storyInitialized: (event: { gameId: string; story: Story }) => void;
}

export class GameQueueProcessor extends BaseQueueProcessor<
  GameOperation,
  Story
> {
  private aiStoryGenerator: AIStoryGenerator;
  private aiImageGenerator: AIImageGenerator;

  constructor() {
    super();
    this.aiStoryGenerator = new AIStoryGenerator();
    this.aiImageGenerator = new AIImageGenerator();
  }

  protected getQueueId(operation: GameOperation): string {
    return operation.gameId;
  }

  protected async processOperation(operation: GameOperation): Promise<void> {
    switch (operation.type) {
      case "initializeStory":
        await this.handleInitializeStory(operation);
        break;
      case "moveStoryForward":
        await this.handleMoveStoryForward(operation);
        break;
      case "recordChoice":
        await this.handleRecordChoice(operation);
        break;
      default:
        throw new Error(`Unknown operation type: ${operation.type}`);
    }
  }

  private async handleInitializeStory(
    operation: GameOperation & { type: "initializeStory" }
  ): Promise<void> {
    const { gameId, input } = operation;
    const {
      prompt,
      generateImages,
      playerCount,
      maxTurns,
      gameMode,
      playerCodes,
    } = input;

    // Create initial state
    const storyState = await this.aiStoryGenerator.createInitialState(
      prompt,
      generateImages,
      playerCount,
      maxTurns,
      gameMode
    );

    const story = Story.create(storyState);

    // Add player codes to state
    const storyWithCodes = story.clone({
      playerCodes,
    });

    this.events.emit("storyInitialized", {
      gameId: operation.gameId,
      story: storyWithCodes,
    });
    this.events.emit("storyUpdated", {
      gameId: operation.gameId,
      story: storyWithCodes,
    });

    // Queue the first moveStoryForward operation
    await this.addOperation({
      type: "moveStoryForward",
      gameId: operation.gameId,
      input: { story: storyWithCodes },
    });
  }

  private async handleMoveStoryForward(
    operation: GameOperation & { type: "moveStoryForward" }
  ): Promise<void> {
    const { gameId, input } = operation;
    const { story } = input;

    try {
      console.log(
        "[GameQueueProcessor] Starting story progression for game:",
        gameId
      );

      // Determine the thread (step) resolutions based on individual players' resolutions
      let updatedStory = story;
      // updatedState = await this.determineThreadResolutions(updatedState);

      // Determine next beat type and prepare state
      const currentBeatType = story.determineNextBeatType();

      // Generate content based on beat type
      if (currentBeatType === "switch") {
        console.log("[GameQueueProcessor] Generating switches");
        updatedStory = await this.aiStoryGenerator.generateSwitches(story);
      } else if (
        currentBeatType === "thread" &&
        story.getCurrentThreadBeatsCompleted() === 0
      ) {
        console.log("[GameQueueProcessor] Generating threads");
        updatedStory = await this.aiStoryGenerator.generateThreads(story);
      }

      // Generate beats and list of beats needing images
      console.log("[GameQueueProcessor] Generating beats");
      const [nextStory, changes, beatsNeedingImages] =
        await this.aiStoryGenerator.generateBeats(updatedStory);

      // Apply changes
      console.log("[GameQueueProcessor] Applying changes to state");
      const storyWithChanges = nextStory.applyStoryChanges(changes);

      // Save and broadcast state update
      this.events.emit("storyUpdated", {
        gameId: operation.gameId,
        story: storyWithChanges,
      });

      // Generate images if needed
      let finalStory = storyWithChanges;
      if (
        storyWithChanges.includesImages() &&
        Object.keys(beatsNeedingImages).length > 0
      ) {
        console.log("[GameQueueProcessor] Generating images for beats");
        finalStory = await this.aiImageGenerator.generateImagesForBeats(
          storyWithChanges,
          beatsNeedingImages
        );
      }

      // Save and broadcast state update for images
      this.events.emit("storyUpdated", {
        gameId: operation.gameId,
        story: finalStory,
      });
    } catch (error) {
      console.error(
        "[GameQueueProcessor] Failed to move story forward:",
        error
      );
      throw error;
    }
  }

  private async handleRecordChoice(
    operation: GameOperation & { type: "recordChoice" }
  ): Promise<void> {
    const { gameId, input } = operation;
    const { playerSlot, optionIndex, story } = input;

    // Update story with the new choice
    const updatedStory = story.updateChoice(playerSlot, optionIndex);

    // Process success/failure resolutions if applicable
    const storyWithResolutions = this.processIndividualStepResolution(
      updatedStory,
      playerSlot,
      optionIndex
    );

    // Emit state update to update pending players lists
    this.events.emit("storyUpdated", { gameId, story: updatedStory });

    // Queue next operation if all choices are in
    if (storyWithResolutions.areAllChoicesSubmitted()) {
      // Move the story forward
      await this.addOperation({
        type: "moveStoryForward",
        gameId,
        input: { story: storyWithResolutions },
      });
    }
  }

  private processIndividualStepResolution(
    story: Story,
    playerSlot: PlayerSlot,
    optionIndex: number
  ): Story {
    // If not a thread beat or no thread analysis, return state unchanged
    if (
      story.getCurrentBeatType() !== "thread" ||
      !story.getCurrentThreadAnalysis() ||
      story.getCurrentTurn() === 0
    ) {
      return story;
    }

    const currentBeat = story.getCurrentBeat(playerSlot);

    // Only process if the option is a success/failure type
    if (currentBeat.options[optionIndex].optionType !== "successFailure") {
      return story;
    }

    // Get the previous beat for this player (if any)
    const previousBeat = story.getPreviousBeat(playerSlot);

    // Process the beat resolution
    const beatResolution = OutcomeService.processBeatResolution(
      currentBeat,
      previousBeat
    );

    return story.updateBeatResolution(playerSlot, beatResolution);
  }
}
// Create singleton instance
export const gameQueueProcessor = new GameQueueProcessor();
