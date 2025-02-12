import type { StoryState } from "./story.js";
import type { Beat } from "./beat.js";
import type { Image } from "./image.js";

// Base message types
interface BaseMessage {
  type: string;
  sessionId?: string;
}

// Client -> Server messages
export interface JoinMessage extends BaseMessage {
  type: "join";
  sessionId: string;
}

export interface InitializeStoryMessage extends BaseMessage {
  type: "initialize_story";
  payload: {
    prompt: string;
    generateImages: boolean;
  };
}

export interface MakeChoiceMessage extends BaseMessage {
  type: "make_choice";
  sessionId: string;
  payload: {
    optionIndex: number;
  };
}

export interface ExitStoryMessage extends BaseMessage {
  type: "exit_story";
  sessionId: string;
}

export type ClientMessage = JoinMessage | InitializeStoryMessage | MakeChoiceMessage | ExitStoryMessage;

// Server -> Client messages
export interface StateUpdateMessage extends BaseMessage {
  type: "state_update";
  state: StoryState;
}

export interface SessionCreatedMessage extends BaseMessage {
  type: "session_created";
  sessionId: string;
}

export interface ErrorMessage extends BaseMessage {
  type: "error";
  error: string;
}

export type ServerMessage = StateUpdateMessage | SessionCreatedMessage | ErrorMessage;

// Helper type guard
export function isErrorMessage(message: ServerMessage): message is ErrorMessage {
  return message.type === "error";
}
