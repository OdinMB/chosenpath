import type { StoryState } from "./story.js";

// Client -> Server messages
export type WSClientMessage =
  | { type: "create_session" }
  | { type: "join_session"; sessionId: string }
  | { type: "initialize_story"; prompt: string; generateImages: boolean }
  | { type: "make_choice"; optionIndex: number }
  | { type: "exit_story" };

// Server -> Client messages
export type WSServerMessage = 
  | { type: "session_created"; sessionId: string }
  | { type: "state_update"; state: StoryState }
  | { type: "exit_story_response" }
  | { type: "error"; error: string }; 