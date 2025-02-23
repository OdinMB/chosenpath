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
import { determineNextBeatType } from "shared/utils/storyUtils.js";
import { areAllChoicesSubmitted } from "shared/utils/storyUtils.js";

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

    // Emit state update
    this.events.emit("stateUpdated", { gameId, state: updatedState });

    // Queue next operation if all choices are in
    if (areAllChoicesSubmitted(updatedState)) {
      await this.addOperation({
        type: "moveStoryForward",
        gameId,
        input: { state: updatedState },
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
}

// Create singleton instance
export const gameQueueProcessor = new GameQueueProcessor();
