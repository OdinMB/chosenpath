import type { StoryState } from "./story.js";

// Client -> Server messages
export interface WSClientMessage {
  type: "create_session" | "join" | "initialize_story" | "make_choice";
  sessionId?: string;
  payload?: {
    prompt?: string;
    generateImages?: boolean;
    optionIndex?: number;
  };
}

// Server -> Client messages
export interface WSServerMessage {
  type: "session_created" | "state_update" | "error" | "exit_story_response";
  sessionId?: string;
  state?: StoryState;
  error?: string;
} 