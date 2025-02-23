import type { StoryState } from "shared/types/story.js";
import type { PlayerSlot } from "shared/types/player.js";
import type { Beat } from "shared/types/beat.js";
import type { GameMode } from "shared/types/story.js";
import type { PlayerCount } from "shared/types/player.js";

// Base operation type for any queueable operation
export interface QueueableOperation {
  id: string;
  status: "pending" | "processing" | "completed" | "failed";
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}

// Define the operations and their handlers in one place
export interface GameOperations {
  initializeStory: {
    input: {
      prompt: string;
      generateImages: boolean;
      playerCount: PlayerCount;
      maxTurns: number;
      gameMode: GameMode;
      playerCodes: Record<PlayerSlot, string>;
    };
    state: StoryState;
  };
  recordChoice: {
    input: {
      playerSlot: PlayerSlot;
      optionIndex: number;
      state: StoryState;
    };
    state: StoryState;
  };
  moveStoryForward: {
    input: {
      state: StoryState;
    };
    state: StoryState;
  };
  generateImages: {
    input: {
      beatsNeedingImages: Record<string, Beat>;
      state: StoryState;
    };
    state: StoryState;
  };
}

export type GameOperationType = keyof GameOperations;

type OperationForType<T extends GameOperationType> = {
  type: T;
  input: GameOperations[T]["input"];
};

export type GameOperation = QueueableOperation & {
  gameId: string;
} & {
    [K in GameOperationType]: OperationForType<K>;
  }[GameOperationType];

// Events
export interface StateUpdateEvent {
  gameId: string;
  state: StoryState;
}

export interface OperationErrorEvent {
  queueId: string;
  operationId: string;
  error: string;
}

export interface QueueEvents {
  stateUpdated: (event: StateUpdateEvent) => void;
  operationError: (data: {
    gameId: string;
    operationType: GameOperationType;
    error: string;
  }) => void;
  newOperation: () => void;
}
