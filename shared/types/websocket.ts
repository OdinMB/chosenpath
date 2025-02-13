import type { StoryState } from "./story.js";
import type { PlayerCount } from "./players.js";

// Client -> Server messages
export type WSClientMessage =
  | { type: "create_session" }
  | { type: "join_session"; sessionId: string }
  | { type: "initialize_story"; prompt: string; generateImages: boolean; playerCount: PlayerCount }
  | { type: "make_choice"; optionIndex: number }
  | { type: "verify_code"; code: string }
  | { type: "exit_story" };

// Server -> Client messages
export type WSServerMessage = 
  | { type: "session_created"; sessionId: string }
  | { type: "story_codes"; codes: Record<string, string> }
  | { type: "state_update"; state: StoryState }
  | { type: "verify_code_response"; state: StoryState | null; error?: string }
  | { type: "exit_story_response" }
  | { type: "error"; error: string }; 