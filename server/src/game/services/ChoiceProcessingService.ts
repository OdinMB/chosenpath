import type { PlayerSlot, DifficultyLevel } from "core/types/index.js";
import { Story } from "core/models/Story.js";
import { BeatResolutionService } from "./BeatResolutionService.js";
import { pregenerationService } from "./PregenerationService.js";
import { storyDbService } from "server/stories/StoryDbService.js";
import { Logger } from "shared/logger.js";

export interface ChoiceProcessingResult {
  processedStory: Story;
  shouldTriggerProgression: boolean;
  requiresPregeneration: boolean;
}

export class ChoiceProcessingService {
  private static instance: ChoiceProcessingService;

  private constructor() {}

  public static getInstance(): ChoiceProcessingService {
    if (!ChoiceProcessingService.instance) {
      ChoiceProcessingService.instance = new ChoiceProcessingService();
    }
    return ChoiceProcessingService.instance;
  }

  /**
   * Main entry point for processing a player choice
   * Handles pregeneration state checking and appropriate processing
   */
  public async processChoice(
    gameId: string,
    story: Story,
    playerSlot: PlayerSlot,
    optionIndex: number
  ): Promise<ChoiceProcessingResult> {
    console.log(
      `[ChoiceProcessingService] Processing choice for game: ${gameId}, player: ${playerSlot}, option: ${optionIndex}`
    );

    const currentTurn = story.getCurrentTurn();
    const pregeneratedState = await this.checkPregeneratedState(gameId, currentTurn, playerSlot, optionIndex, story);

    console.log(`[ChoiceProcessingService] Pregeneration check result: ${pregeneratedState.type} for ${gameId}: turn ${currentTurn}, ${playerSlot}, option ${optionIndex}`);

    switch (pregeneratedState.type) {
      case 'complete':
        return await this.handleChoiceWithCompletePregen(gameId, story, playerSlot, optionIndex, pregeneratedState.story!);
      case 'partial':
        return await this.handleChoiceWithPartialPregen(gameId, story, playerSlot, optionIndex, pregeneratedState.story!);
      case 'none':
        return await this.handleChoiceWithoutPregen(gameId, story, playerSlot, optionIndex);
    }
  }

  /**
   * Process beat resolution for a choice
   */
  public processBeatResolution(
    story: Story,
    playerSlot: PlayerSlot,
    optionIndex: number,
    difficultyLevel: DifficultyLevel
  ): Story {
    const currentBeat = story.getCurrentBeat(playerSlot);

    // If no beat exists, return the story unchanged
    if (!currentBeat) {
      console.log(
        "[ChoiceProcessingService] ERROR: No current beat found for",
        playerSlot
      );
      return story;
    }

    let updatedStory = story;

    // For Exploration Beats, just set the resolution directly
    if (currentBeat.options[optionIndex].optionType === "exploration") {
      const beatResolution = BeatResolutionService.getExplorationBeatResolution(currentBeat);
      console.log(
        "[ChoiceProcessingService] Updating exploration beat resolution for",
        playerSlot,
        "to",
        beatResolution
      );
      return story.updateBeatResolution(playerSlot, beatResolution);
    }

    // Process challenge beat resolution
    const threadLastStepResolution = story.getCurrentThreadLastStepResolution(playerSlot);

    // Ensure difficultyLevel is valid
    const dLevel = difficultyLevel || {
      title: "Error: Missing Difficulty",
      modifier: 0,
    };

    if (!difficultyLevel) {
      console.error(
        `[ChoiceProcessingService] processBeatResolution called with null/undefined difficultyLevel for story ${story.getId()}. Using default.`
      );
    }

    const result = BeatResolutionService.getChallengeBeatResolution(
      currentBeat,
      threadLastStepResolution,
      dLevel,
      story
    );

    console.log(
      "[ChoiceProcessingService] Updating challenge beat resolution for",
      playerSlot,
      "to",
      result.resolution
    );

    // First add resolution details
    updatedStory = story.updateBeatResolutionDetails(
      playerSlot,
      result.details
    );

    // Then update the actual resolution
    return updatedStory.updateBeatResolution(playerSlot, result.resolution);
  }

  /**
   * Handle choice when complete pregeneration is available
   * Complete pregeneration has the next beat already generated
   */
  private async handleChoiceWithCompletePregen(
    gameId: string,
    story: Story,
    playerSlot: PlayerSlot,
    optionIndex: number,
    pregeneratedStory: Story
  ): Promise<ChoiceProcessingResult> {
    console.log(`[ChoiceProcessingService] Using complete pregenerated state for ${gameId}: ${playerSlot}, option ${optionIndex}`);
    
    // Update database for player choice
    await this.updateDatabaseForChoice(gameId, playerSlot);
    
    // Update database for turn progression (since we're moving to next beat)
    // The pregenerated story already has the advanced turn, so we need to update DB to match
    await this.updateDatabaseForProgression(gameId, pregeneratedStory);
    
    return {
      processedStory: pregeneratedStory,
      shouldTriggerProgression: false, // Already progressed
      requiresPregeneration: true, // Need pregeneration for the new beat
    };
  }

  /**
   * Handle choice when partial pregeneration is available
   * Partial pregeneration has only the beat resolution but no next beat
   */
  private async handleChoiceWithPartialPregen(
    gameId: string,
    story: Story,
    playerSlot: PlayerSlot,
    optionIndex: number,
    pregeneratedStory: Story
  ): Promise<ChoiceProcessingResult> {
    console.log(`[ChoiceProcessingService] Using partial pregenerated state (beat resolution only) for ${gameId}: ${playerSlot}, option ${optionIndex}`);
    
    // Verify the pregenerated story has the choice properly recorded
    const playerState = pregeneratedStory.getPlayer(playerSlot);
    if (playerState && playerState.beatHistory.length > 0) {
      const lastBeat = playerState.beatHistory[playerState.beatHistory.length - 1];
      console.log(`[ChoiceProcessingService] Partial pregenerated state - last beat choice: ${lastBeat.choice}`);
      console.log(`[ChoiceProcessingService] This should show interlude on client if choice !== -1`);
    }
    
    // Update database for player choice (but not turn progression yet)
    await this.updateDatabaseForChoice(gameId, playerSlot);
    
    // Check if all choices are submitted
    const shouldTriggerProgression = pregeneratedStory.areAllChoicesSubmitted();
    if (shouldTriggerProgression) {
      await pregenerationService.cancelPregenerationForTurn(gameId, story.getCurrentTurn());
      console.log(`[ChoiceProcessingService] All choices submitted, will trigger story progression`);
    }
    
    return {
      processedStory: pregeneratedStory,
      shouldTriggerProgression,
      requiresPregeneration: false, // Don't start new pregeneration yet
    };
  }

  /**
   * Handle choice when no pregeneration is available
   * Process choice and beat resolution from scratch
   */
  private async handleChoiceWithoutPregen(
    gameId: string,
    story: Story,
    playerSlot: PlayerSlot,
    optionIndex: number
  ): Promise<ChoiceProcessingResult> {
    console.log(`[ChoiceProcessingService] Processing choice without pregeneration for ${gameId}: ${playerSlot}, option ${optionIndex}`);
    
    // Process the choice and beat resolution
    const storyWithChoice = story.updateChoice(playerSlot, optionIndex);
    
    // Get difficulty level
    const currentDifficultyLevel = storyWithChoice.getState().difficultyLevel;
    const difficultyToUse: DifficultyLevel = currentDifficultyLevel || { title: "Balanced", modifier: -10 };
    
    if (!currentDifficultyLevel) {
      console.warn(`[ChoiceProcessingService] Difficulty level not found for game ${gameId}. Using default.`);
    }
    
    const storyWithBeatResolution = this.processBeatResolution(
      storyWithChoice,
      playerSlot,
      optionIndex,
      difficultyToUse
    );
    
    // Update database for player choice
    await this.updateDatabaseForChoice(gameId, playerSlot);
    
    // Check if all choices are submitted
    const shouldTriggerProgression = storyWithBeatResolution.areAllChoicesSubmitted();
    if (shouldTriggerProgression) {
      await pregenerationService.cancelPregenerationForTurn(gameId, story.getCurrentTurn());
      console.log(`[ChoiceProcessingService] All choices submitted, will trigger story progression`);
    }
    
    return {
      processedStory: storyWithBeatResolution,
      shouldTriggerProgression,
      requiresPregeneration: false, // Don't start new pregeneration yet
    };
  }

  /**
   * Check what type of pregenerated state is available
   */
  private async checkPregeneratedState(
    gameId: string,
    turn: number,
    playerSlot: PlayerSlot,
    optionIndex: number,
    originalStory: Story
  ): Promise<{type: 'none' | 'partial' | 'complete', story?: Story}> {
    return await pregenerationService.checkPregenerationStatus(
      gameId, 
      turn, 
      playerSlot, 
      optionIndex, 
      originalStory
    );
  }

  /**
   * Update database for player choice
   */
  private async updateDatabaseForChoice(gameId: string, playerSlot: PlayerSlot): Promise<void> {
    try {
      await storyDbService.updatePlayerPendingStatus(gameId, playerSlot, false);
    } catch (dbError) {
      Logger.Queue.error(
        `DB service error updating player ${playerSlot} pending status for ${gameId}:`,
        dbError
      );
    }
  }

  /**
   * Update database for story progression
   */
  private async updateDatabaseForProgression(gameId: string, story: Story): Promise<void> {
    const playerSlots = story.getPlayerSlots();
    try {
      await storyDbService.updateStoryBeatAndTimestamp(gameId, story.getCurrentTurn());
      await storyDbService.setAllPlayersPending(gameId, playerSlots);
    } catch (dbError) {
      Logger.Queue.error(
        `DB service error updating story progression for ${gameId}:`,
        dbError
      );
    }
  }
}

// Export singleton instance
export const choiceProcessingService = ChoiceProcessingService.getInstance();