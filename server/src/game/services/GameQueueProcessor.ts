import type {
  GameOperation,
  StoryUpdateEvent,
  OperationErrorEvent,
} from "game/queue.js";
import type { PlayerSlot } from "core/types/index.js";
import { AIStoryGenerator } from "./AIStoryGenerator.js";
import { AIImageGenerator } from "./AIImageGenerator.js";
import { BaseQueueProcessor } from "./QueueProcessor.js";
import { BeatResolutionService } from "./BeatResolutionService.js";
import { Story } from "core/models/Story.js";
import { ThreadResolutionService } from "./ThreadResolutionService.js";
import { Resolution } from "core/types/index.js";
import { storyRepository } from "shared/StoryRepository.js";
import { connectionManager } from "shared/ConnectionManager.js";
import { ChangeService } from "./ChangeService.js";
import { ensureStoryDirectoryStructure } from "shared/storageUtils.js";
import { Logger } from "shared/logger.js";
import { storyDbService } from "server/shared/StoryDbService.js";

export interface QueueEvents {
  storyUpdated: (event: StoryUpdateEvent) => void;
  operationError: (event: OperationErrorEvent) => void;
}

// Update GameOperation type in queue.js if needed, but for this file we'll extend it here
export type GameOperationType =
  | "moveStoryForward"
  | "recordChoice"
  | "recordCharacterSelection";

export interface GameOperationExtended {
  gameId: string;
  type: GameOperationType;
  input: any;
}

export class GameQueueProcessor extends BaseQueueProcessor<
  GameOperation,
  Story
> {
  private aiStoryGenerator: AIStoryGenerator;
  private aiImageGenerator: AIImageGenerator;
  private changeService: ChangeService;

  constructor() {
    super();
    this.aiStoryGenerator = new AIStoryGenerator();
    this.aiImageGenerator = new AIImageGenerator();
    this.changeService = new ChangeService();
  }

  protected getQueueId(operation: GameOperation): string {
    return operation.gameId;
  }

  protected async processOperation(operation: GameOperation): Promise<void> {
    switch (operation.type) {
      case "moveStoryForward":
        await this.handleMoveStoryForward(operation);
        break;
      case "recordChoice":
        await this.handleRecordChoice(operation);
        break;
      case "recordCharacterSelection":
        await this.handleRecordCharacterSelection(operation);
        break;
      default:
        throw new Error(`Unknown operation type: ${operation.type}`);
    }
  }

  /**
   * Helper method to update and broadcast story state
   */
  private async updateAndBroadcastStory(
    gameId: string,
    story: Story
  ): Promise<void> {
    // Ensure the story directory structure exists
    await ensureStoryDirectoryStructure(gameId);

    // Store the updated story in the repository (this also updates stories.current_turn and stories.updatedAt)
    await storyRepository.storeStory(gameId, story);

    // Then broadcast the update to all connected clients
    connectionManager.broadcastStoryUpdate(gameId, story);
  }

  private async handleMoveStoryForward(
    operation: GameOperation
  ): Promise<void> {
    if (operation.type !== "moveStoryForward") return;

    const { gameId, input } = operation;
    const { story } = input;

    try {
      console.log(
        "[GameQueueProcessor] Starting story progression for game:",
        gameId
      );

      let updatedStory = story.clone();

      // If the current thread is not resolved, determine the resolutions for the previous set of beats
      if (
        updatedStory.getCurrentBeatType() === "thread" &&
        !updatedStory.isCurrentThreadResolved()
      ) {
        console.log(
          "[GameQueueProcessor] Determining resolutions for previous set of beats"
        );
        updatedStory = await this.determineThreadResolutions(updatedStory);

        console.log(
          `[GameQueueProcessor] After resolution - Is current thread resolved: ${updatedStory.isCurrentThreadResolved()}`
        );
      }

      // Determine next beat type and prepare state
      const nextBeatTypeToCreate = updatedStory.determineNextBeatType();

      console.log(
        `[GameQueueProcessor] Next beat type to create: ${nextBeatTypeToCreate}`
      );

      // Preparatory steps before beat generation
      if (nextBeatTypeToCreate === "switch") {
        console.log("[GameQueueProcessor] Generating switches");
        updatedStory = await this.aiStoryGenerator.generateSwitches(
          updatedStory
        );
      } else if (
        nextBeatTypeToCreate === "thread" &&
        updatedStory.getCurrentThreadBeatsCompleted() === 0
      ) {
        console.log("[GameQueueProcessor] Generating threads");
        updatedStory = await this.aiStoryGenerator.generateThreads(
          updatedStory
        );
      }

      // Generate beats and list of beats needing images
      console.log("[GameQueueProcessor] Generating beats");
      console.log(
        `[GameQueueProcessor] Current turn: ${updatedStory.getCurrentTurn()}`
      );

      const [nextStory, changes, imageRequests] =
        await this.aiStoryGenerator.generateBeats(updatedStory);

      // Apply changes using ChangeService directly
      console.log("[GameQueueProcessor] Applying changes to state");
      let finalStory = this.changeService.applyChanges(nextStory, changes);

      // Store and broadcast the first update
      await this.updateAndBroadcastStory(gameId, finalStory);

      // Generate images if needed
      if (finalStory.getState().generateImages && imageRequests.length > 0) {
        console.log("[GameQueueProcessor] Generating images for beats");
        finalStory = await this.aiImageGenerator.generateImagesForBeats(
          finalStory,
          imageRequests
        );

        // Store and broadcast the updated state with images
        await this.updateAndBroadcastStory(gameId, finalStory);
      }

      // --- DB Integration: Update story_players and stories.updatedAt after turn progresses ---
      // This also updates story.current_turn via storeStory -> storyDbService.updateStoryTurnAndTimestamp
      // and stories.updatedAt is handled by setAllPlayersPending
      const playerSlots = finalStory.getPlayerSlots();
      try {
        await storyDbService.updateStoryTurnAndTimestamp(
          gameId,
          finalStory.getCurrentTurn()
        );
        await storyDbService.setAllPlayersPending(gameId, playerSlots);
        // Logger.Queue.log(...); // Logging is done by the service methods
      } catch (dbError) {
        Logger.Queue.error(
          `DB service error updating players to pending for ${gameId}:`,
          dbError
        );
      }
      // --- DB Integration End ---
    } catch (error) {
      console.error(
        "[GameQueueProcessor] Failed to move story forward:",
        error
      );
      throw error;
    }
  }

  private async handleRecordChoice(operation: GameOperation): Promise<void> {
    if (operation.type !== "recordChoice") return;

    const { gameId, input } = operation;
    const { playerSlot, optionIndex, story } = input;

    // Update story with the new choice
    const updatedStory = story.updateChoice(playerSlot, optionIndex);

    const storyWithBeatResolution = this.processBeatResolution(
      updatedStory,
      playerSlot,
      optionIndex
    );

    // Store and broadcast the story update (this also updates stories.current_turn via storeStory -> service)
    await this.updateAndBroadcastStory(gameId, storyWithBeatResolution);

    // --- DB Integration: Update story_players for the player who made a choice ---
    // stories.updatedAt is handled by updatePlayerStatus
    try {
      await storyDbService.updatePlayerStatus(gameId, playerSlot, false); // isPending = false
      // Logger.Queue.log(...); // Logging by service
    } catch (dbError) {
      Logger.Queue.error(
        `DB service error updating player ${playerSlot} status for ${gameId}:`,
        dbError
      );
    }
    // --- DB Integration End ---

    // Queue next operation if all choices are in
    if (storyWithBeatResolution.areAllChoicesSubmitted()) {
      // Move the story forward
      await this.addOperation({
        type: "moveStoryForward",
        gameId,
        input: { story: storyWithBeatResolution },
      });
    }
  }

  private processBeatResolution(
    story: Story,
    playerSlot: PlayerSlot,
    optionIndex: number
  ): Story {
    const currentBeat = story.getCurrentBeat(playerSlot);

    // If no beat exists, return the story unchanged
    if (!currentBeat) {
      console.log(
        "[GameQueueProcessor] ERROR: No current beat found for",
        playerSlot
      );
      return story;
    }

    let beatResolution: Resolution | null = null;
    let updatedStory = story;

    // For Exploration Beats, just set the resolution directly
    if (currentBeat.options[optionIndex].optionType === "exploration") {
      beatResolution =
        BeatResolutionService.getExplorationBeatResolution(currentBeat);

      console.log(
        "[GameQueueProcessor] Updating exploration beat resolution for ",
        playerSlot,
        "to",
        beatResolution
      );

      return story.updateBeatResolution(playerSlot, beatResolution);
    }

    // Process challenge beat resolution
    // Get the thread's last step resolution for this player
    const threadLastStepResolution =
      story.getCurrentThreadLastStepResolution(playerSlot);

    // Get both resolution and details from BeatResolutionService
    const result = BeatResolutionService.getChallengeBeatResolution(
      currentBeat,
      threadLastStepResolution
    );

    beatResolution = result.resolution;

    console.log(
      "[GameQueueProcessor] Updating challenge beat resolution for ",
      playerSlot,
      "to",
      beatResolution
    );

    // First add resolution details
    updatedStory = story.updateBeatResolutionDetails(
      playerSlot,
      result.details
    );

    // Then update the actual resolution
    return updatedStory.updateBeatResolution(playerSlot, beatResolution);
  }

  private async handleRecordCharacterSelection(
    operation: GameOperation
  ): Promise<void> {
    if (operation.type !== "recordCharacterSelection") return;

    const { gameId, input } = operation;
    const { playerSlot, identityIndex, backgroundIndex, story } = input;

    console.log(
      `[GameQueueProcessor] Processing character selection for ${playerSlot}: identity=${identityIndex}, background=${backgroundIndex}`
    );

    // Get the selected identity and background
    const options = story.getState().characterSelectionOptions[playerSlot];
    if (!options) {
      throw new Error(`No character options found for player ${playerSlot}`);
    }

    const selectedIdentity = options.possibleCharacterIdentities[identityIndex];
    const selectedBackground =
      options.possibleCharacterBackgrounds[backgroundIndex];

    if (!selectedIdentity || !selectedBackground) {
      throw new Error("Invalid identity or background selection");
    }

    // Update the player's character information
    let updatedStory = story.setCharacterSelection(
      playerSlot,
      selectedIdentity,
      selectedBackground,
      identityIndex,
      backgroundIndex
    );

    // Store and broadcast the updated state
    await this.updateAndBroadcastStory(gameId, updatedStory);

    // --- DB Integration: Update story_players for the player who selected a character ---
    // stories.updatedAt is handled by updatePlayerStatus
    try {
      await storyDbService.updatePlayerStatus(gameId, playerSlot, false); // isPending = false
      // Logger.Queue.log(...); // Logging by service
    } catch (dbError) {
      Logger.Queue.error(
        `DB service error updating player ${playerSlot} status for ${gameId} (char select):`,
        dbError
      );
    }
    // --- DB Integration End ---

    // Check if all players have completed character selection
    if (updatedStory.areAllCharactersSelected()) {
      console.log(
        "[GameQueueProcessor] All characters selected, completing character selection"
      );

      // Mark character selection as completed
      updatedStory = updatedStory.completeCharacterSelection();

      // Store and broadcast the updated state with completed character selection
      await this.updateAndBroadcastStory(gameId, updatedStory);

      // Queue the moveStoryForward operation to start the game
      await this.addOperation({
        type: "moveStoryForward",
        gameId,
        input: { story: updatedStory },
      });
    }
  }

  private async determineThreadResolutions(story: Story): Promise<Story> {
    console.log(
      "[GameQueueProcessor] Starting thread resolution determination"
    );

    let updatedStory: Story = story.clone();

    const threadAnalysis = updatedStory.getCurrentThreadAnalysis();
    if (!threadAnalysis) {
      console.log(
        "[GameQueueProcessor] ERROR: No thread analysis found, returning story unchanged"
      );
      return story;
    }

    // Process each thread to determine its next step's resolution
    for (const thread of threadAnalysis.threads) {
      // Determine the resolution for this thread
      const resolution = ThreadResolutionService.getThreadResolution(
        thread,
        updatedStory
      );

      console.log(
        `[GameQueueProcessor] Determined resolution for thread ${thread.id}: ${resolution}`
      );

      updatedStory = updatedStory.updateThreadResolution(thread, resolution);
    }

    // If the threads are resolved, set the milestones
    if (updatedStory.isCurrentThreadResolved()) {
      console.log(
        "[GameQueueProcessor] Threads are resolved, setting milestones"
      );

      const updatedThreadAnalysis = updatedStory.getCurrentThreadAnalysis();
      if (!updatedThreadAnalysis) {
        console.log(
          "[GameQueueProcessor] ERROR: No thread analysis found after resolution"
        );
        return updatedStory;
      }

      for (const thread of updatedThreadAnalysis.threads) {
        // Skip threads with null resolution
        if (!thread.resolution) {
          console.log(
            `[GameQueueProcessor] ERROR: Thread ${thread.id} has no resolution, skipping milestone`
          );
          continue;
        }

        const milestone = ThreadResolutionService.getMilestone(
          thread,
          thread.resolution
        );

        console.log(
          `[GameQueueProcessor] Setting milestone for thread ${thread.id}: ${milestone}`
        );

        // Only update if milestone is not null
        if (milestone) {
          updatedStory = updatedStory.updateThreadMilestone(thread, milestone);
        } else {
          console.log(
            `[GameQueueProcessor] ERROR: No milestone generated for thread ${thread.id}`
          );
        }
      }
    }

    return updatedStory;
  }
}

// Create singleton instance
export const gameQueueProcessor = new GameQueueProcessor();
