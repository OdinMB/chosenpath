import { BaseQueueProcessor } from "./QueueProcessor.js";
import type {
  GameOperation,
  StateUpdateEvent,
  OperationErrorEvent,
} from "../types/queue.js";
import type { StoryState } from "shared/types/story.js";
import type { PlayerSlot } from "shared/types/player.js";
import { AIStoryGenerator } from "./AIStoryGenerator.js";
import { AIImageGenerator } from "./AIImageGenerator.js";
import { ChangeService } from "../services/ChangeService.js";
import { OutcomeService } from "../services/OutcomeService.js";
import { determineNextBeatType } from "shared/utils/storyUtils.js";
import { areAllChoicesSubmitted } from "shared/utils/storyUtils.js";
import { type Beat, type StepResolutionType } from "shared/types/beat.js";

export interface QueueEvents {
  stateUpdated: (event: StateUpdateEvent) => void;
  operationError: (event: OperationErrorEvent) => void;
  storyInitialized: (event: { gameId: string; state: StoryState }) => void;
}

export class GameQueueProcessor extends BaseQueueProcessor<
  GameOperation,
  StoryState
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
    let finalState: StoryState;
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
    const state = await this.aiStoryGenerator.createInitialState(
      prompt,
      generateImages,
      playerCount,
      maxTurns,
      gameMode
    );

    // Add player codes to state
    const stateWithCodes = {
      ...state,
      playerCodes,
    };

    this.events.emit("storyInitialized", {
      gameId: operation.gameId,
      state: stateWithCodes,
    });
    this.events.emit("stateUpdated", {
      gameId: operation.gameId,
      state: stateWithCodes,
    });

    // Queue the first moveStoryForward operation
    await this.addOperation({
      type: "moveStoryForward",
      gameId: operation.gameId,
      input: { state: stateWithCodes },
    });
  }

  private async handleMoveStoryForward(
    operation: GameOperation & { type: "moveStoryForward" }
  ): Promise<void> {
    const { gameId, input } = operation;
    const { state } = input;

    try {
      console.log(
        "[GameQueueProcessor] Starting story progression for game:",
        gameId
      );

      // 1. Determine next beat type and prepare state
      const currentBeatType = determineNextBeatType(state);
      let updatedState = state;

      // 2. Reset beat context if needed
      if (
        currentBeatType === "ending" ||
        currentBeatType === "intro" ||
        currentBeatType === "switch"
      ) {
        console.log(
          "[GameQueueProcessor] Resetting beat context for type:",
          currentBeatType
        );
        updatedState = this.resetBeatContext(updatedState);
      }

      // 3. Generate content based on beat type
      if (currentBeatType === "switch") {
        console.log("[GameQueueProcessor] Generating switches");
        updatedState = await this.aiStoryGenerator.generateSwitches(
          updatedState
        );
      } else if (
        currentBeatType === "thread" &&
        state.currentThreadBeatsCompleted === 0
      ) {
        console.log("[GameQueueProcessor] Generating threads");
        updatedState = await this.aiStoryGenerator.generateThreads(
          updatedState
        );
      }
      updatedState.currentBeatType = currentBeatType;

      // 4. Generate beats and list of beats needing images
      console.log("[GameQueueProcessor] Generating beats");
      const [nextState, changes, beatsNeedingImages] =
        await this.aiStoryGenerator.generateBeats(updatedState);

      // 5. Apply changes
      console.log("[GameQueueProcessor] Applying changes to state");
      const stateWithChanges = this.changeService.applyChanges(
        nextState,
        changes
      );

      // 6. Update thread beat counter if needed
      if (currentBeatType === "thread") {
        console.log(
          "[GameQueueProcessor] Updating thread beat counter:",
          stateWithChanges.currentThreadBeatsCompleted + 1
        );
        stateWithChanges.currentThreadBeatsCompleted += 1;
      }

      // Save and broadcast state update
      this.events.emit("stateUpdated", {
        gameId: operation.gameId,
        state: stateWithChanges,
      });

      // 7. Generate images if needed
      let finalState = stateWithChanges;
      if (state.generateImages && Object.keys(beatsNeedingImages).length > 0) {
        console.log("[GameQueueProcessor] Generating images for beats");
        finalState = await this.aiImageGenerator.generateImagesForBeats(
          stateWithChanges,
          beatsNeedingImages
        );
      }

      // Save and broadcast state update for images
      this.events.emit("stateUpdated", {
        gameId: operation.gameId,
        state: finalState,
      });
    } catch (error) {
      console.error(
        "[GameQueueProcessor] Failed to move story forward:",
        error
      );
      throw error;
    }
  }

  private resetBeatContext(state: StoryState): StoryState {
    return {
      ...state,
      currentBeatType: null,
      currentSwitchAnalysis: null,
      currentThreadAnalysis: null,
      currentThreadMaxBeats: 0,
      currentThreadBeatsCompleted: 0,
      previousThreadAnalysis: state.currentThreadAnalysis,
    };
  }

  private async handleRecordChoice(
    operation: GameOperation & { type: "recordChoice" }
  ): Promise<void> {
    const { gameId, input } = operation;
    const { playerSlot, optionIndex, state } = input;

    // Update state with the new choice
    const updatedState = this.updateStateWithChoice(
      state,
      playerSlot,
      optionIndex
    );

    // Process success/failure outcomes if applicable
    const stateWithOutcomes = this.processSuccessFailureOutcome(
      updatedState,
      playerSlot,
      optionIndex
    );

    // Emit state update
    this.events.emit("stateUpdated", { gameId, state: stateWithOutcomes });

    // Queue next operation if all choices are in
    if (areAllChoicesSubmitted(stateWithOutcomes)) {
      await this.addOperation({
        type: "moveStoryForward",
        gameId,
        input: { state: stateWithOutcomes },
      });
    }
  }

  private updateStateWithChoice(
    state: StoryState,
    playerSlot: PlayerSlot,
    optionIndex: number
  ): StoryState {
    const player = state.players[playerSlot];
    return {
      ...state,
      players: {
        ...state.players,
        [playerSlot]: {
          ...player,
          beatHistory: player.beatHistory.map((beat, index) =>
            index === player.beatHistory.length - 1
              ? { ...beat, choice: optionIndex }
              : beat
          ),
        },
      },
    };
  }

  /**
   * Process success/failure outcomes for a player's choice
   */
  private processSuccessFailureOutcome(
    state: StoryState,
    playerSlot: PlayerSlot,
    optionIndex: number
  ): StoryState {
    // If not a thread beat or no thread analysis, return state unchanged
    if (
      state.currentBeatType !== "thread" ||
      !state.currentThreadAnalysis ||
      state.players[playerSlot].beatHistory.length === 0
    ) {
      return state;
    }

    const updatedState = { ...state };
    const player = updatedState.players[playerSlot];
    const currentBeat = player.beatHistory[player.beatHistory.length - 1];

    // Only process if the option is a success/failure type
    if (currentBeat.options[optionIndex].optionType !== "successFailure") {
      return updatedState;
    }

    // Get the previous beat for this player (if any)
    const previousBeat =
      player.beatHistory.length > 1
        ? player.beatHistory[player.beatHistory.length - 2]
        : null;

    // Process the beat resolution
    const beatResolution = OutcomeService.processBeatResolution(
      currentBeat,
      previousBeat
    );

    // Update the beat with the resolution
    const updatedBeat: Beat = {
      ...currentBeat,
      resolution: beatResolution,
    };

    // Update the player's beat history with the processed beat
    const updatedPlayers = {
      ...updatedState.players,
      [playerSlot]: {
        ...player,
        beatHistory: [
          ...player.beatHistory.slice(0, player.beatHistory.length - 1),
          updatedBeat,
        ],
      },
    };

    const stateWithUpdatedPlayers = {
      ...updatedState,
      players: updatedPlayers,
    };

    // If this is a contested thread, check if we need to compare sides
    this.processContestedThreadOutcomes(stateWithUpdatedPlayers);

    return stateWithUpdatedPlayers;
  }

  /**
   * Process contested thread outcomes by comparing sides
   */
  private processContestedThreadOutcomes(state: StoryState): void {
    // Only process if this is a thread and all players have submitted choices
    if (
      state.currentBeatType !== "thread" ||
      !state.currentThreadAnalysis ||
      !areAllChoicesSubmitted(state)
    ) {
      return;
    }

    // Initialize the contest outcomes map if it doesn't exist
    if (!state.currentThreadContestOutcomes) {
      state.currentThreadContestOutcomes = {};
    }

    // Process each contested thread
    state.currentThreadAnalysis.threads?.forEach((thread) => {
      // Skip threads that aren't contested
      if (!thread.playersSideB || thread.playersSideB.length === 0) {
        return;
      }

      const { playersSideA, playersSideB, id } = thread;

      // Get the latest beat for each player
      const sideABeats = playersSideA
        .map((playerSlot) => {
          const player = state.players[playerSlot];
          return player.beatHistory[player.beatHistory.length - 1];
        })
        .filter((beat) => beat.resolution !== null);

      const sideBBeats = playersSideB
        .map((playerSlot) => {
          const player = state.players[playerSlot];
          return player.beatHistory[player.beatHistory.length - 1];
        })
        .filter((beat) => beat.resolution !== null);

      // Only proceed if all players have resolutions
      if (
        sideABeats.length !== playersSideA.length ||
        sideBBeats.length !== playersSideB.length
      ) {
        return;
      }

      // Calculate the average outcome for each side
      const sideAOutcome = this.calculateAverageOutcome(sideABeats);
      const sideBOutcome = this.calculateAverageOutcome(sideBBeats);

      // Compare the outcomes to determine the winner
      const contestedOutcome = OutcomeService.compareContestedOutcomes(
        sideAOutcome,
        sideBOutcome
      );

      // Store the contested outcome in the state for this specific thread
      if (id) {
        state.currentThreadContestOutcomes[id] = contestedOutcome;
      }
    });
  }

  /**
   * Calculate the average outcome from a list of beats
   */
  private calculateAverageOutcome(beats: Beat[]): StepResolutionType {
    if (beats.length === 0) {
      return "mixed"; // Default to mixed if no beats
    }

    // Count the occurrences of each outcome
    const counts = {
      favorable: 0,
      mixed: 0,
      unfavorable: 0,
    };

    for (const beat of beats) {
      if (beat.resolution) {
        counts[beat.resolution]++;
      }
    }

    // Find the most common outcome
    let maxCount = 0;
    let maxOutcome: StepResolutionType = "mixed";

    for (const [outcome, count] of Object.entries(counts)) {
      if (count > maxCount) {
        maxCount = count;
        maxOutcome = outcome as StepResolutionType;
      }
    }

    return maxOutcome;
  }
}

// Create singleton instance
export const gameQueueProcessor = new GameQueueProcessor();
