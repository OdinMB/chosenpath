import type {
  GameOperation,
  StoryUpdateEvent,
  OperationErrorEvent,
} from "game/queue.js";
import type { PlayerSlot } from "core/types/index.js";
import { AIImageGenerator } from "../../images/AIImageGenerator.js";
import { getStoryPlayerPortraitDescription } from "../../images/imagePrompts.js";
import { IMAGE_GENERATION_STORY_PLAYER_QUALITY } from "server/config.js";
import { BaseQueueProcessor } from "./QueueProcessor.js";
import { Story } from "core/models/Story.js";
import { ImageRequest, IMAGE_SIZES } from "core/types/index.js";
import { storyRepository } from "../../stories/StoryRepository.js";
import { connectionManager } from "server/game/ConnectionManager.js";
import { choiceProcessingService } from "./ChoiceProcessingService.js";
import { storyProgressionService } from "./StoryProgressionService.js";
import { pregenerationService } from "./PregenerationService.js";
import { ensureStoryDirectoryStructure } from "shared/storageUtils.js";
import { Logger } from "shared/logger.js";
import { storyDbService } from "server/stories/StoryDbService.js";
import { CharacterIdentity } from "core/types/index.js";
import {
  applyImageOutcome,
  collectLatestBeatImageRequests,
  mergeImageRecords,
  startBackgroundImageGeneration,
  type StoryImageJobDeps,
} from "./StoryImageJobs.js";

export interface QueueEvents {
  storyUpdated: (event: StoryUpdateEvent) => void;
  operationError: (event: OperationErrorEvent) => void;
}

// Update GameOperation type in queue.js if needed, but for this file we'll extend it here
export type GameOperationType =
  | "moveStoryForward"
  | "recordChoice"
  | "recordCharacterSelection"
  | "pregenerateStoryState"
  | "bulkPregenerateStoryStates"
  | "attachImageToStory"
  | "recordImageFailure";

export interface GameOperationExtended {
  gameId: string;
  type: GameOperationType;
  input: unknown;
}

export class GameQueueProcessor extends BaseQueueProcessor<GameOperation> {
  private imageJobDeps: StoryImageJobDeps;

  constructor() {
    super();
    const aiImageGenerator = new AIImageGenerator();
    this.imageJobDeps = {
      generate: (story, request) =>
        aiImageGenerator.generateBeatImage(story, request),
      enqueue: (operation) => this.addOperation(operation),
    };
  }

  protected getQueueId(operation: GameOperation): string {
    return operation.gameId;
  }

  protected async processOperation(operation: GameOperation): Promise<void> {
    switch (operation.type) {
      case "moveStoryForward":
        await this.handleMoveStoryForward(operation);
        break;
      case "attachImageToStory":
      case "recordImageFailure":
        await this.handleImageOutcome(operation);
        break;
      case "recordChoice":
        await this.handleRecordChoice(operation);
        break;
      case "recordCharacterSelection":
        await this.handleRecordCharacterSelection(operation);
        break;
      case "pregenerateStoryState":
        await this.handlePregenerateStoryState(operation);
        break;
      case "bulkPregenerateStoryStates":
        await this.handleBulkPregenerateStoryStates(operation);
        break;
      default:
        throw new Error(`Unknown operation type: ${operation.type}`);
    }
  }
  // No extraction fallback

  /**
   * Helper method to update and broadcast story state
   */
  private async updateAndBroadcastStory(
    gameId: string,
    story: Story
  ): Promise<void> {
    // Ensure the story directory structure exists
    await ensureStoryDirectoryStructure(gameId);

    // Keep image outcomes that landed after `story` was read (an operation
    // working from an older copy, or an adopted pregeneration, must not drop
    // an attached or failed image, or the reader would wait for it forever)
    const latest = await storyRepository.getStory(gameId);
    const toStore = latest ? mergeImageRecords(latest, story) : story;

    // Store the updated story in the repository (this also updates stories.current_turn and stories.updatedAt)
    await storyRepository.storeStory(gameId, toStore);

    // Then broadcast the update to all connected clients
    connectionManager.broadcastStoryUpdate(gameId, toStore);
  }

  private async handleMoveStoryForward(
    operation: GameOperation
  ): Promise<void> {
    if (operation.type !== "moveStoryForward") return;

    const { gameId, input } = operation;
    const { story } = input;

    try {
      console.log(
        `[GameQueueProcessor] Moving story forward for game: ${gameId}`
      );

      // Use the new story progression service
      const result = await storyProgressionService.handleProgression(
        gameId,
        story
      );

      // Store and broadcast the final story immediately (do not block on image generation)
      await this.updateAndBroadcastStory(gameId, result.finalStory);

      // Unified image flow: collect from latest beats and spawn background generation
      if (result.finalStory.getState().generateImages) {
        await this.triggerImageGenerationFlow(gameId, result.finalStory);
      }

      // Trigger pregeneration if needed
      if (result.requiresPregeneration) {
        await pregenerationService.triggerPregeneration(result.finalStory);
      }
    } catch (error) {
      Logger.Queue.error(
        `[GameQueueProcessor] Failed to move story forward for game: ${gameId}:`,
        error
      );
      throw error;
    }
  }

  private async handleRecordChoice(operation: GameOperation): Promise<void> {
    if (operation.type !== "recordChoice") return;

    const { gameId, input } = operation;
    const { playerSlot, optionIndex, story } = input;

    try {
      console.log(
        `[GameQueueProcessor] Recording choice for game: ${gameId}, player: ${playerSlot}, option: ${optionIndex}`
      );

      // Use the new choice processing service
      const result = await choiceProcessingService.processChoice(
        gameId,
        story,
        playerSlot,
        optionIndex
      );

      // Store and broadcast the processed story
      await this.updateAndBroadcastStory(gameId, result.processedStory);

      // Queue story progression if needed
      if (result.shouldTriggerProgression) {
        console.log(
          `[GameQueueProcessor] Queuing story progression for ${gameId}`
        );
        await this.addOperation({
          type: "moveStoryForward",
          gameId,
          input: { story: result.processedStory },
        });
      } else {
        // Already progressed via complete pregeneration; run unified image flow
        if (result.processedStory.getState().generateImages) {
          await this.triggerImageGenerationFlow(gameId, result.processedStory);
        }
      }

      // Trigger pregeneration if needed
      if (result.requiresPregeneration) {
        await pregenerationService.triggerPregeneration(result.processedStory);
      }
    } catch (error) {
      Logger.Queue.error(
        `[GameQueueProcessor] Failed to record choice for game: ${gameId}, player: ${playerSlot}, option: ${optionIndex}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Unified image generation flow: generates the latest beats' images in the
   * background (StoryImageJobs), then attaches or records each outcome.
   */
  private async triggerImageGenerationFlow(
    gameId: string,
    story: Story
  ): Promise<void> {
    void startBackgroundImageGeneration(
      this.imageJobDeps,
      gameId,
      story,
      collectLatestBeatImageRequests(story),
      { attachToLibrary: true }
    );
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

    const selectedIdentity: CharacterIdentity =
      options.possibleCharacterIdentities[identityIndex];
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

    // Update database
    try {
      await storyDbService.updatePlayerPendingStatus(gameId, playerSlot, false);
    } catch (dbError) {
      Logger.Queue.error(
        `DB service error updating player ${playerSlot} pending status for ${gameId} (char select):`,
        dbError
      );
    }

    // Store and broadcast the updated state
    await this.updateAndBroadcastStory(gameId, updatedStory);

    // Generate player image if needed
    if (story.generatesImages() && !story.isBasedOnTemplate()) {
      console.log("[GameQueueProcessor] Generating player image in background");
      const imageRequest: ImageRequest = {
        caption: selectedIdentity.name,
        id: playerSlot + "_" + identityIndex,
        prompt: getStoryPlayerPortraitDescription(selectedIdentity),
        subDir: "players",
        imageSize: IMAGE_SIZES.PORTRAIT,
        imageQuality: IMAGE_GENERATION_STORY_PLAYER_QUALITY,
        referenceImageIds: [],
      };

      // Fire and forget. Player images stay out of the story's image library;
      // a failed portrait is recorded so the reader hides it.
      void startBackgroundImageGeneration(
        this.imageJobDeps,
        gameId,
        updatedStory,
        [imageRequest],
        { attachToLibrary: false }
      );
    }

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

  /**
   * Applies an image outcome (attached or failed) to the latest stored story
   * and broadcasts it. Never rethrows: image bookkeeping must not surface as
   * an error message in the reader, whose text does not depend on it.
   */
  private async handleImageOutcome(operation: GameOperation): Promise<void> {
    if (
      operation.type !== "attachImageToStory" &&
      operation.type !== "recordImageFailure"
    ) {
      return;
    }
    const { gameId } = operation;
    const { imageId } = operation.input;

    try {
      console.log(
        `[GameQueueProcessor] ${operation.type} for game: ${gameId}, imageId: ${imageId}`
      );

      const currentStory = await storyRepository.getStory(gameId);
      if (!currentStory) {
        Logger.Queue.error(
          `[GameQueueProcessor] Story not found for ${operation.type}: ${gameId}`
        );
        return;
      }

      await this.updateAndBroadcastStory(
        gameId,
        applyImageOutcome(currentStory, operation)
      );

      // No need to mirror into pregenerated files. We merge live image library into pregenerated
      // states when storing/using them (see mergeImageRecords calls elsewhere).
    } catch (error) {
      Logger.Queue.error(
        `[GameQueueProcessor] ${operation.type} failed for game: ${gameId}, imageId: ${imageId}:`,
        error
      );
    }
  }

  // Keep the existing pregeneration handlers for now - these are complex and working
  // TODO: These should eventually be moved to PregenerationService as well

  private async handlePregenerateStoryState(
    operation: GameOperation
  ): Promise<void> {
    if (operation.type !== "pregenerateStoryState") return;

    const { gameId, input } = operation;
    const { story, playerSlot, optionIndex, turn } = input;

    try {
      console.log(
        `[GameQueueProcessor] Starting pregeneration for game: ${gameId}, turn: ${turn}, player: ${playerSlot}, option: ${optionIndex}`
      );

      // Use the internal pregeneration method
      await this.pregenerateStoryStateInternal(
        story,
        gameId,
        turn,
        playerSlot,
        optionIndex
      );
    } catch (error) {
      console.error(
        `[GameQueueProcessor] Failed to pregenerate story state for game: ${gameId}, turn: ${turn}, player: ${playerSlot}, option: ${optionIndex}:`,
        error
      );

      // Mark pregeneration as complete even on failure to avoid stuck states
      pregenerationService.markPregenerationComplete(
        gameId,
        turn,
        playerSlot,
        optionIndex
      );
      throw error;
    }
  }

  private async handleBulkPregenerateStoryStates(
    operation: GameOperation
  ): Promise<void> {
    if (operation.type !== "bulkPregenerateStoryStates") return;

    const { gameId, input } = operation;
    const { story, turn, playersAndOptions } = input;

    try {
      console.log(
        `[GameQueueProcessor] Starting bulk pregeneration for game: ${gameId}, turn: ${turn}, ${playersAndOptions.length} players`
      );

      // Phase 1: Immediately store beat resolutions (for interludes) - run in parallel
      console.log(
        `[GameQueueProcessor] Phase 1: Storing beat resolutions in parallel (outside queue)`
      );
      const beatResolutionPromises: Promise<void>[] = [];
      for (const playerData of playersAndOptions) {
        const { playerSlot, optionIndices } = playerData;
        for (const optionIndex of optionIndices) {
          beatResolutionPromises.push(
            this.storeBeatResolution(
              story,
              gameId,
              turn,
              playerSlot,
              optionIndex
            )
          );
        }
      }

      await Promise.all(beatResolutionPromises);
      console.log(
        `[GameQueueProcessor] Phase 1 complete: ${beatResolutionPromises.length} beat resolutions stored`
      );

      // Phase 2: Start full pregeneration in background (don't await - fire and forget)
      console.log(
        `[GameQueueProcessor] Phase 2: Starting full pregeneration in background (parallel, no queue)`
      );
      for (const playerData of playersAndOptions) {
        const { playerSlot, optionIndices } = playerData;
        for (const optionIndex of optionIndices) {
          // Fire and forget - run in background without blocking
          this.pregenerateStoryStateInternal(
            story,
            gameId,
            turn,
            playerSlot,
            optionIndex
          ).catch((error) => {
            console.error(
              `[GameQueueProcessor] Background pregeneration failed for ${gameId}: ${turn}_${playerSlot}_${optionIndex}:`,
              error
            );
            // Still mark as complete to avoid stuck states
            pregenerationService.markPregenerationComplete(
              gameId,
              turn,
              playerSlot,
              optionIndex
            );
          });
        }
      }

      console.log(
        `[GameQueueProcessor] Bulk pregeneration setup complete - beat resolutions available immediately, full pregeneration running in background`
      );
    } catch (error) {
      console.error(
        `[GameQueueProcessor] Failed bulk pregeneration for game: ${gameId}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Internal method to store a beat resolution as a partial pregeneration state
   */
  private async storeBeatResolution(
    story: Story,
    gameId: string,
    turn: number,
    playerSlot: PlayerSlot,
    optionIndex: number
  ): Promise<void> {
    try {
      // Check if pregenerated state already exists (skip if already complete)
      const existingState = await storyRepository.hasPregeneratedStory(
        gameId,
        turn,
        playerSlot,
        optionIndex
      );
      if (existingState) {
        console.log(
          `[GameQueueProcessor] Pregenerated state already exists for ${gameId}: ${turn}_${playerSlot}_${optionIndex}`
        );
        return;
      }

      console.log(
        `[GameQueueProcessor] Storing beat resolution as partial pregeneration for game: ${gameId}, turn: ${turn}, player: ${playerSlot}, option: ${optionIndex}`
      );

      // Use ChoiceProcessingService to process the beat resolution
      const storyWithChoice = story.updateChoice(playerSlot, optionIndex);

      // Get difficulty level
      const currentDifficultyLevel = storyWithChoice.getState().difficultyLevel;
      const difficultyToUse = currentDifficultyLevel || {
        title: "Balanced",
        modifier: -10,
      };

      if (!currentDifficultyLevel) {
        console.warn(
          `[GameQueueProcessor] Difficulty level not found in story state for game ${gameId}. Using default.`
        );
      }

      // Process beat resolution for the chosen option using the service
      const storyWithBeatResolution =
        choiceProcessingService.processBeatResolution(
          storyWithChoice,
          playerSlot,
          optionIndex,
          difficultyToUse
        );

      // Merge current actual story images into pregenerated state to avoid losing refs
      const latestActual = await storyRepository.getStory(gameId);
      const storyToStore = latestActual
        ? mergeImageRecords(latestActual, storyWithBeatResolution)
        : storyWithBeatResolution;

      // Store the partial pregeneration state (has beat resolution for interludes)
      await storyRepository.storePregeneratedStory(
        gameId,
        turn,
        playerSlot,
        optionIndex,
        storyToStore
      );

      console.log(
        `[GameQueueProcessor] Successfully stored beat resolution as partial pregeneration for game: ${gameId}, turn: ${turn}, player: ${playerSlot}, option: ${optionIndex}`
      );
    } catch (error) {
      console.error(
        `[GameQueueProcessor] Failed to store beat resolution for game: ${gameId}, turn: ${turn}, player: ${playerSlot}, option: ${optionIndex}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Internal method to pregenerate a single story state (used by bulk operation)
   */
  private async pregenerateStoryStateInternal(
    story: Story,
    gameId: string,
    turn: number,
    playerSlot: PlayerSlot,
    optionIndex: number
  ): Promise<void> {
    try {
      const pregenerationKey = `${turn}_${playerSlot}_${optionIndex}`;

      // Check if this pregeneration is already in progress or completed
      const inProgress = pregenerationService.isPregenerationInProgress(
        gameId,
        turn,
        playerSlot,
        optionIndex
      );
      if (inProgress) {
        console.log(
          `[GameQueueProcessor] Pregeneration already in progress for ${gameId}: ${pregenerationKey}`
        );
        return;
      }

      // Try to get existing partial pregeneration state with beat resolution first
      let storyWithBeatResolution = await storyRepository.getPregeneratedStory(
        gameId,
        turn,
        playerSlot,
        optionIndex
      );

      // Check if we already have a COMPLETE pregenerated state (with next beat generated)
      if (storyWithBeatResolution) {
        // Ensure we have a proper Story instance
        if (!(storyWithBeatResolution instanceof Story)) {
          console.error(
            `[GameQueueProcessor] getPregeneratedStory returned non-Story instance for ${gameId}: ${pregenerationKey}`
          );
          // Try to create Story instance from the data
          if (
            storyWithBeatResolution &&
            typeof storyWithBeatResolution === "object"
          ) {
            storyWithBeatResolution = new Story(
              storyWithBeatResolution as unknown as import("core/types/index.js").StoryState
            );
          } else {
            throw new Error(
              `Invalid pregenerated story data for ${gameId}: ${pregenerationKey}`
            );
          }
        }

        // Check if this is a complete state (has next beat) or just partial (only has beat resolution)
        const playerState = storyWithBeatResolution.getPlayer(playerSlot);
        if (!playerState) {
          console.error(
            `[GameQueueProcessor] No player state found for ${playerSlot} in pregenerated story for ${gameId}: ${pregenerationKey}`
          );
          throw new Error(`No player state found for ${playerSlot}`);
        }

        const currentBeatIndex = playerState.beatHistory.length - 1;
        const currentBeat = playerState.beatHistory[currentBeatIndex];

        // If the choice has been made AND there's a next beat, this is already complete
        if (
          currentBeat &&
          currentBeat.choice !== -1 &&
          playerState.beatHistory.length > currentBeatIndex + 1
        ) {
          console.log(
            `[GameQueueProcessor] Complete pregenerated state already exists for ${gameId}: ${pregenerationKey}`
          );
          return;
        }

        console.log(
          `[GameQueueProcessor] Found partial pregenerated state, will update with full content for ${gameId}: ${pregenerationKey}`
        );
      }

      // Mark as in progress
      pregenerationService.markPregenerationInProgress(
        gameId,
        turn,
        playerSlot,
        optionIndex
      );

      console.log(
        `[GameQueueProcessor] Starting full pregeneration for game: ${gameId}, turn: ${turn}, player: ${playerSlot}, option: ${optionIndex}`
      );

      if (!storyWithBeatResolution) {
        console.log(
          `[GameQueueProcessor] No partial pregeneration state found, processing choice for full pregeneration: ${gameId}, ${turn}, ${playerSlot}, ${optionIndex}`
        );

        // Use the ChoiceProcessingService to create the beat resolution state
        const storyWithChoice = story.updateChoice(playerSlot, optionIndex);
        const currentDifficultyLevel =
          storyWithChoice.getState().difficultyLevel;
        const difficultyToUse = currentDifficultyLevel || {
          title: "Balanced",
          modifier: -10,
        };

        if (!currentDifficultyLevel) {
          console.warn(
            `[GameQueueProcessor] Difficulty level not found in story state for game ${gameId}. Using default.`
          );
        }

        storyWithBeatResolution = choiceProcessingService.processBeatResolution(
          storyWithChoice,
          playerSlot,
          optionIndex,
          difficultyToUse
        );
      } else {
        console.log(
          `[GameQueueProcessor] Updating pregen with full LLM content: ${gameId}, ${turn}, ${playerSlot}, ${optionIndex}`
        );
      }

      // Check if all choices are submitted for this hypothetical state
      if (storyWithBeatResolution.areAllChoicesSubmitted()) {
        // Use StoryProgressionService to handle the full story progression
        // BUT don't update the database - pregeneration should not affect the real game state
        console.log(
          `[GameQueueProcessor] All choices submitted in pregeneration, generating next beat (no DB update)`
        );

        // Temporarily create a progression without DB updates
        const progressionResult = await this.handleProgressionForPregeneration(
          gameId,
          storyWithBeatResolution
        );

        // Merge images from latest actual story before storing complete pregenerated state
        const latestActual = await storyRepository.getStory(gameId);
        const finalToStore = latestActual
          ? mergeImageRecords(latestActual, progressionResult.finalStory)
          : progressionResult.finalStory;

        // Store the complete pregenerated story state
        await storyRepository.storePregeneratedStory(
          gameId,
          turn,
          playerSlot,
          optionIndex,
          finalToStore
        );

        console.log(
          `[GameQueueProcessor] Successfully stored complete pregenerated story state for game: ${gameId}, turn: ${turn}, player: ${playerSlot}, option: ${optionIndex}`
        );
      } else {
        // Just store the state with the choice applied but not yet progressed
        const latestActualMid = await storyRepository.getStory(gameId);
        const midToStore = latestActualMid
          ? mergeImageRecords(latestActualMid, storyWithBeatResolution)
          : storyWithBeatResolution;
        await storyRepository.storePregeneratedStory(
          gameId,
          turn,
          playerSlot,
          optionIndex,
          midToStore
        );

        console.log(
          `[GameQueueProcessor] Stored intermediate pregenerated state for game: ${gameId}, turn: ${turn}, player: ${playerSlot}, option: ${optionIndex}`
        );
      }

      // Mark pregeneration as complete
      pregenerationService.markPregenerationComplete(
        gameId,
        turn,
        playerSlot,
        optionIndex
      );
    } catch (error) {
      console.error(
        `[GameQueueProcessor] Failed to pregenerate story state for game: ${gameId}, turn: ${turn}, player: ${playerSlot}, option: ${optionIndex}:`,
        error
      );

      // Mark pregeneration as complete even on failure to avoid stuck states
      pregenerationService.markPregenerationComplete(
        gameId,
        turn,
        playerSlot,
        optionIndex
      );
      throw error;
    }
  }

  /**
   * Handle story progression for pregeneration without database updates
   * This generates the next beat but doesn't update the actual game state in the database
   */
  private async handleProgressionForPregeneration(
    gameId: string,
    story: Story
  ): Promise<{ finalStory: Story }> {
    console.log(
      `[GameQueueProcessor] Starting pregeneration-only story progression`
    );

    // Use StoryProgressionService with skipDatabaseUpdate flag
    const progressionResult = await storyProgressionService.handleProgression(
      gameId,
      story,
      true
    );

    console.log(
      `[GameQueueProcessor] Pregeneration story progression complete`
    );
    return { finalStory: progressionResult.finalStory };
  }
}

// Create singleton instance
export const gameQueueProcessor = new GameQueueProcessor();
