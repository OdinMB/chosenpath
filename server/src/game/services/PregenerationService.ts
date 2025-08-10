import { Story } from "core/models/Story.js";
import { PlayerSlot } from "core/types/index.js";
import { MAX_OPTIONS_FOR_PREGENERATION } from "core/config.js";
import { storyRepository } from "../../stories/StoryRepository.js";
import { gameQueueProcessor } from "./GameQueueProcessor.js";
import { Logger } from "shared/logger.js";

export class PregenerationService {
  private static instance: PregenerationService;
  private pregenerationStatus: Map<string, Set<string>> = new Map(); // storyId -> set of "turn_playerSlot_optionIndex"
  private pendingProgressions: Map<string, { turn: number; playerSlot: PlayerSlot; optionIndex: number }> = new Map(); // storyId -> pending progression info

  private constructor() {}

  public static getInstance(): PregenerationService {
    if (!PregenerationService.instance) {
      PregenerationService.instance = new PregenerationService();
    }
    return PregenerationService.instance;
  }

  /**
   * Checks if pregeneration should be triggered for the given story
   * @param story - The current story state
   * @returns True if pregeneration should be triggered
   */
  public shouldTriggerPregeneration(story: Story): boolean {
    // Only trigger pregeneration if the story has it enabled
    if (!story.getState().pregenerateBeats) {
      console.log(`[PregenerationService] Pregeneration disabled for story ${story.getId()}`);
      return false;
    }

    // Don't pregenerate for ending beats or character selection
    const currentBeatType = story.getCurrentBeatType();
    if (currentBeatType === "ending" || !story.getState().characterSelectionCompleted) {
      console.log(
        `[PregenerationService] Skipping pregeneration - beat type: ${currentBeatType}, character selection completed: ${story.getState().characterSelectionCompleted}`
      );
      return false;
    }

    // Check if all players except one have made their choices
    const playerSlots = story.getPlayerSlots();
    const playersWhoChose = playerSlots.filter(slot => {
      const currentBeat = story.getCurrentBeat(slot);
      return currentBeat && currentBeat.choice !== -1;
    });

    const playersYetToChoose = playerSlots.length - playersWhoChose.length;

    console.log(
      `[PregenerationService] Total players: ${playerSlots.length}, Players who chose: ${playersWhoChose.length}, Players yet to choose: ${playersYetToChoose}`
    );

    // Trigger when all but one player have made choices
    // In singleplayer (1 player total), this means 0 players yet to choose (1 - 1 = 0)
    // In multiplayer (2+ players), this means 1 player yet to choose
    const shouldTrigger = playersYetToChoose === 1;
    console.log(`[PregenerationService] Should trigger pregeneration: ${shouldTrigger}`);
    return shouldTrigger;
  }

  /**
   * Triggers pregeneration for all remaining options for players who haven't chosen yet
   * @param story - The current story state
   */
  public async triggerPregeneration(story: Story): Promise<void> {
    if (!this.shouldTriggerPregeneration(story)) {
      return;
    }

    const storyId = story.getId();
    const currentTurn = story.getCurrentTurn();
    const playerSlots = story.getPlayerSlots();

    Logger.Queue.log(`[PregenerationService] Triggering pregeneration for story ${storyId}, turn ${currentTurn}`);

    // Find players who haven't made their choice yet (should be exactly 1 player based on shouldTriggerPregeneration)
    const playersYetToChoose = playerSlots.filter(slot => {
      const currentBeat = story.getCurrentBeat(slot);
      return currentBeat && currentBeat.choice === -1;
    });

    console.log(`[PregenerationService] Players yet to choose: ${playersYetToChoose.length} (${playersYetToChoose.join(', ')})`);

    // Collect all players and their options for bulk pregeneration
    const playersAndOptions: Array<{ playerSlot: PlayerSlot; optionIndices: number[] }> = [];
    
    for (const playerSlot of playersYetToChoose) {
      const currentBeat = story.getCurrentBeat(playerSlot);
      if (!currentBeat || !currentBeat.options) {
        console.log(`[PregenerationService] No beat or options for player ${playerSlot}, skipping`);
        continue;
      }

      // Check if too many options to pregenerate
      if (currentBeat.options.length > MAX_OPTIONS_FOR_PREGENERATION) {
        console.log(`[PregenerationService] Player ${playerSlot} has ${currentBeat.options.length} options (max ${MAX_OPTIONS_FOR_PREGENERATION}), skipping pregeneration`);
        continue;
      }

      console.log(`[PregenerationService] Will pregenerate ${currentBeat.options.length} options for player ${playerSlot}`);
      
      // Add all option indices for this player
      const optionIndices = Array.from({ length: currentBeat.options.length }, (_, i) => i);
      playersAndOptions.push({ playerSlot, optionIndices });
    }

    // Queue single bulk pregeneration operation if there's work to do
    // This will immediately store beat resolutions, then continue with full pregeneration
    if (playersAndOptions.length > 0) {
      const totalOptions = playersAndOptions.reduce((sum, p) => sum + p.optionIndices.length, 0);
      console.log(`[PregenerationService] Queueing bulk pregeneration operation for ${totalOptions} total options`);
      
      await gameQueueProcessor.addOperation({
        gameId: storyId,
        type: "bulkPregenerateStoryStates",
        input: {
          story,
          turn: currentTurn,
          playersAndOptions,
        },
      });
      
      console.log(`[PregenerationService] Bulk pregeneration operation queued`);
    }
  }


  /**
   * Marks a pregeneration as complete and checks if we should proceed with story progression
   * @param storyId - The story ID
   * @param turn - The turn number
   * @param playerSlot - The player slot
   * @param optionIndex - The option index
   */
  public markPregenerationComplete(
    storyId: string,
    turn: number,
    playerSlot: PlayerSlot,
    optionIndex: number
  ): void {
    const pregenerationKey = `${turn}_${playerSlot}_${optionIndex}`;
    this.pregenerationStatus.get(storyId)?.delete(pregenerationKey);
    Logger.Queue.log(`[PregenerationService] Marked pregeneration complete for ${storyId}: ${pregenerationKey}`);

    // Check if this completed pregeneration allows us to proceed with story progression
    this.checkForPendingProgression(storyId, turn, playerSlot, optionIndex);
  }

  /**
   * Checks if there's a pending story progression waiting for this specific pregenerated state
   * @param storyId - The story ID
   * @param turn - The turn number
   * @param playerSlot - The player slot
   * @param optionIndex - The option index
   */
  private async checkForPendingProgression(
    storyId: string,
    turn: number,
    playerSlot: PlayerSlot,
    optionIndex: number
  ): Promise<void> {
    try {
      // Check if there's a pending progression for this story
      const pendingProgression = this.pendingProgressions.get(storyId);
      if (!pendingProgression) {
        return; // No pending progression
      }

      // Check if this completed pregeneration matches the pending progression
      if (
        pendingProgression.turn === turn &&
        pendingProgression.playerSlot === playerSlot &&
        pendingProgression.optionIndex === optionIndex
      ) {
        console.log(`[PregenerationService] Pending progression matches completed pregeneration for ${storyId}, triggering story progression`);
        
        // Remove the pending progression
        this.pendingProgressions.delete(storyId);

        // Get the pregenerated story and queue progression
        const pregeneratedStory = await this.getPregeneratedStory(storyId, turn, playerSlot, optionIndex);
        if (pregeneratedStory) {
          await gameQueueProcessor.addOperation({
            gameId: storyId,
            type: "moveStoryForward",
            input: { story: pregeneratedStory },
          });
        } else {
          console.error(`[PregenerationService] Expected pregenerated story not found for ${storyId}: ${turn}_${playerSlot}_${optionIndex}`);
        }
      }
    } catch (error) {
      Logger.Queue.error(`[PregenerationService] Error checking for pending progression: ${error}`);
    }
  }

  /**
   * Cancels all ongoing pregeneration for a story turn
   * @param storyId - The story ID
   * @param turn - The turn number
   */
  public async cancelPregenerationForTurn(storyId: string, turn: number): Promise<void> {
    Logger.Queue.log(`[PregenerationService] Cancelling pregeneration for story ${storyId}, turn ${turn}`);

    // Remove from in-progress tracking
    const inProgress = this.pregenerationStatus.get(storyId);
    if (inProgress) {
      const toRemove = Array.from(inProgress).filter(key => key.startsWith(`${turn}_`));
      toRemove.forEach(key => inProgress.delete(key));
    }

    // Skip deleting pregenerated files for debugging purposes
    Logger.Queue.log(`[PregenerationService] Keeping pregenerated files for debugging (story ${storyId}, turn ${turn})`);
  }

  /**
   * Gets a pregenerated story state if available
   * @param storyId - The story ID
   * @param turn - The turn number
   * @param playerSlot - The player slot
   * @param optionIndex - The option index
   * @returns The pregenerated story or null if not available
   */
  public async getPregeneratedStory(
    storyId: string,
    turn: number,
    playerSlot: PlayerSlot,
    optionIndex: number
  ): Promise<Story | null> {
    return await storyRepository.getPregeneratedStory(storyId, turn, playerSlot, optionIndex);
  }

  /**
   * Check what type of pregenerated state is available with detailed analysis
   * @param storyId - The story ID
   * @param turn - The turn number
   * @param playerSlot - The player slot
   * @param optionIndex - The option index
   * @param originalStory - The current story state for comparison
   * @returns Detailed pregeneration status
   */
  public async checkPregenerationStatus(
    storyId: string,
    turn: number,
    playerSlot: PlayerSlot,
    optionIndex: number,
    originalStory: Story
  ): Promise<{type: 'none' | 'partial' | 'complete', story?: Story}> {
    const pregeneratedStory = await this.getPregeneratedStory(storyId, turn, playerSlot, optionIndex);
    
    if (!pregeneratedStory) {
      return { type: 'none' };
    }
    
    // Check if this is a complete state (has next beat) or just partial (only has beat resolution)
    const pregeneratedPlayerState = pregeneratedStory.getPlayer(playerSlot);
    const originalPlayerState = originalStory.getPlayer(playerSlot);
    
    if (!pregeneratedPlayerState || !originalPlayerState) {
      return { type: 'none' };
    }
    
    // Compare beat counts to determine state type
    // Complete pregeneration has more beats than the original story (next beat was generated)
    // Partial pregeneration has the same number of beats but with choice recorded and beat resolution applied
    if (pregeneratedPlayerState.beatHistory.length > originalPlayerState.beatHistory.length) {
      console.log(`[PregenerationService] Complete pregeneration detected: ${pregeneratedPlayerState.beatHistory.length} vs ${originalPlayerState.beatHistory.length} beats`);
      return { type: 'complete', story: pregeneratedStory };
    }
    
    // Check if it's partial (same beat count but with choice and resolution applied)
    const pregeneratedLastBeat = pregeneratedPlayerState.beatHistory[pregeneratedPlayerState.beatHistory.length - 1];
    const originalLastBeat = originalPlayerState.beatHistory[originalPlayerState.beatHistory.length - 1];
    
    if (pregeneratedLastBeat && originalLastBeat && 
        pregeneratedLastBeat.choice !== -1 && originalLastBeat.choice === -1) {
      console.log(`[PregenerationService] Partial pregeneration detected: choice ${pregeneratedLastBeat.choice} applied and beat resolved`);
      console.log(`[PregenerationService] This should trigger interlude view on client (choice !== -1)`);
      return { type: 'partial', story: pregeneratedStory };
    }
    
    // Additional debugging
    if (pregeneratedLastBeat && originalLastBeat) {
      console.log(`[PregenerationService] Beat comparison: pregenerated choice=${pregeneratedLastBeat.choice}, original choice=${originalLastBeat.choice}`);
    }
    
    console.log(`[PregenerationService] Pregenerated state found but unclear type, treating as partial`);
    return { type: 'partial', story: pregeneratedStory };
  }

  /**
   * Checks if a pregeneration is in progress
   * @param storyId - The story ID
   * @param turn - The turn number
   * @param playerSlot - The player slot
   * @param optionIndex - The option index
   * @returns True if pregeneration is in progress
   */
  public isPregenerationInProgress(
    storyId: string,
    turn: number,
    playerSlot: PlayerSlot,
    optionIndex: number
  ): boolean {
    const pregenerationKey = `${turn}_${playerSlot}_${optionIndex}`;
    return this.pregenerationStatus.get(storyId)?.has(pregenerationKey) || false;
  }

  /**
   * Registers a pending progression that should happen when the relevant pregenerated state is ready
   * @param storyId - The story ID
   * @param turn - The turn number
   * @param playerSlot - The player slot
   * @param optionIndex - The option index
   */
  public registerPendingProgression(
    storyId: string,
    turn: number,
    playerSlot: PlayerSlot,
    optionIndex: number
  ): void {
    this.pendingProgressions.set(storyId, { turn, playerSlot, optionIndex });
    console.log(`[PregenerationService] Registered pending progression for ${storyId}: turn ${turn}, player ${playerSlot}, option ${optionIndex}`);
  }

  /**
   * Marks a pregeneration as in progress (used by bulk pregeneration)
   * @param storyId - The story ID
   * @param turn - The turn number
   * @param playerSlot - The player slot
   * @param optionIndex - The option index
   */
  public markPregenerationInProgress(
    storyId: string,
    turn: number,
    playerSlot: PlayerSlot,
    optionIndex: number
  ): void {
    const pregenerationKey = `${turn}_${playerSlot}_${optionIndex}`;
    
    if (!this.pregenerationStatus.has(storyId)) {
      this.pregenerationStatus.set(storyId, new Set());
    }
    this.pregenerationStatus.get(storyId)!.add(pregenerationKey);
    
    Logger.Queue.log(`[PregenerationService] Marked pregeneration as in progress for ${storyId}: ${pregenerationKey}`);
  }

  /**
   * Cleans up pregeneration tracking for a story
   * @param storyId - The story ID
   */
  public cleanupStory(storyId: string): void {
    this.pregenerationStatus.delete(storyId);
    this.pendingProgressions.delete(storyId);
    Logger.Queue.log(`[PregenerationService] Cleaned up pregeneration tracking for story ${storyId}`);
  }
}

// Export singleton instance
export const pregenerationService = PregenerationService.getInstance();