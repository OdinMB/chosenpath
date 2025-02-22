import type { ClientStoryState } from "./story.js";
import type { PlayerSlot } from "./player.js";
import type { GameMode } from "./story.js";

// Client -> Server messages
export type WSClientMessage =
  | { type: "create_session" }
  | { type: "join_session"; sessionId: string }
  | {
      type: "initialize_story";
      prompt: string;
      generateImages: boolean;
      playerCount: number;
      storyBeats: number;
      gameMode: GameMode;
    }
  | { type: "make_choice"; optionIndex: number }
  | { type: "verify_code"; sessionId: string; code: string }
  | { type: "exit_story" };

// Server -> Client messages
export type ActivePlayerStatus = {
  playerSlot: PlayerSlot;
  isConnected: boolean;
  lastActive: Date;
};

export type WSServerMessage =
  | { type: "session_created"; sessionId: string }
  | { type: "state_update"; state: ClientStoryState }
  | { type: "story_codes"; codes: Record<string, string> }
  | { type: "active_players_update"; activePlayers: ActivePlayerStatus[] }
  | {
      type: "verify_code_response";
      state: ClientStoryState | null;
      error?: string;
    }
  | { type: "error"; error: string }
  | { type: "exit_story_response" };
