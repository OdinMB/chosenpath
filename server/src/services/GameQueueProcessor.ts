import { BaseQueueProcessor } from "./QueueProcessor.js";
import type {
  GameOperation,
  GameOperationType,
  StateUpdateEvent,
  OperationErrorEvent,
} from "../types/queue.js";
import type { StoryState } from "shared/types/story.js";
import { StoryStateManager } from "./StoryStateManager.js";
import { AIStoryGenerator } from "./AIStoryGenerator.js";
import { AIImageGenerator } from "./AIImageGenerator.js";

export interface QueueEvents {
  stateUpdated: (event: StateUpdateEvent) => void;
  operationError: (event: OperationErrorEvent) => void;
  storyInitialized: (event: { gameId: string; state: StoryState }) => void;
}

export class GameQueueProcessor extends BaseQueueProcessor<
  GameOperation,
  StoryState
> {
  private storyStateManager: StoryStateManager;
  private aiStoryGenerator: AIStoryGenerator;
  private imageGenerator: AIImageGenerator;

  constructor() {
    super();
    this.storyStateManager = StoryStateManager.getInstance();
    this.aiStoryGenerator = new AIStoryGenerator();
    this.imageGenerator = new AIImageGenerator();
  }

  protected getQueueId(operation: GameOperation): string {
    return operation.gameId;
  }

  protected async processOperation(operation: GameOperation): Promise<void> {
    switch (operation.type) {
      case "initializeStory":
        await this.handleInitializeStory(operation);
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

    // Store state
    await this.storyStateManager.storeState(gameId, stateWithCodes);

    // Emit initialization complete event
    this.events.emit("storyInitialized", {
      gameId,
      state: stateWithCodes,
    });
  }
}

// Create singleton instance
export const gameQueueProcessor = new GameQueueProcessor();
