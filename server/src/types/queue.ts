import type { Story } from "../services/Story.js";
import type { PlayerSlot } from "shared/types/player.js";
import type { Beat } from "shared/types/beat.js";
import type { GameMode, StoryState } from "shared/types/story.js";
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
    story: Story;
  };
  recordChoice: {
    input: {
      playerSlot: PlayerSlot;
      optionIndex: number;
      story: Story;
    };
    story: Story;
  };
  moveStoryForward: {
    input: {
      story: Story;
    };
    story: Story;
  };
  generateImages: {
    input: {
      beatsNeedingImages: Record<string, Beat>;
      story: Story;
    };
    story: Story;
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
export interface StoryUpdateEvent {
  gameId: string;
  story: Story;
}

export interface OperationErrorEvent {
  queueId: string;
  operationId: string;
  gameId: string;
  operationType: GameOperationType;
  error: string;
  details?: string;
  stack?: string;
}

export interface QueueEvents {
  storyUpdated: (event: StoryUpdateEvent) => void;
  operationError: (event: OperationErrorEvent) => void;
  storyInitialized: (event: { gameId: string; story: Story }) => void;
  newOperation: () => void;
}
