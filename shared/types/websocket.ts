import type { ClientStoryState } from "./story.js";
import type { PlayerSlot } from "./player.js";
import type { GameMode } from "./story.js";
import { RateLimitedAction } from "../config.js";

// ===============================================
// Client -> Server message types
// ===============================================

export interface BaseClientMessage {
  requestId?: string;
  type: string;
}

export interface CreateSessionMessage extends BaseClientMessage {
  type: "create_session";
}

export interface JoinSessionMessage extends BaseClientMessage {
  type: "join_session";
  sessionId: string;
}

export interface InitializeStoryMessage extends BaseClientMessage {
  type: "initialize_story";
  prompt: string;
  generateImages: boolean;
  playerCount: number;
  storyBeats: number;
  gameMode: GameMode;
}

export interface MakeChoiceMessage extends BaseClientMessage {
  type: "make_choice";
  optionIndex: number;
}

export interface SelectCharacterMessage extends BaseClientMessage {
  type: "select_character";
  identityIndex: number;
  backgroundIndex: number;
}

export interface VerifyCodeMessage extends BaseClientMessage {
  type: "verify_code";
  sessionId: string;
  code: string;
}

export interface ExitStoryMessage extends BaseClientMessage {
  type: "exit_story";
}

export type WSClientMessage =
  | CreateSessionMessage
  | JoinSessionMessage
  | InitializeStoryMessage
  | MakeChoiceMessage
  | SelectCharacterMessage
  | VerifyCodeMessage
  | ExitStoryMessage;

// ===============================================
// Server -> Client message types
// ===============================================

// ----- Response Types (directly responding to client requests) -----

/**
 * Standardized response status types for all API requests
 */
export enum ResponseStatus {
  RATE_LIMITED = "rate_limited",
  INVALID = "invalid",
  ERROR = "error",
  SUCCESS = "success",
}

/**
 * Rate limit information returned when a request is limited
 */
export interface RateLimitInfo {
  action: RateLimitedAction;
  timeRemaining: number;
  maxRequests?: number;
  windowMs?: number;
  requestsRemaining: number;
}

/**
 * Base response for direct replies to client requests
 */
export interface BaseServerResponse {
  type: string;
  requestId: string;
  status: ResponseStatus;
  timestamp: number;
}

export interface RateLimitedResponse extends BaseServerResponse {
  status: ResponseStatus.RATE_LIMITED;
  rateLimit: RateLimitInfo;
}

/**
 * Success response with data
 */
export interface SuccessResponse extends BaseServerResponse {
  status: ResponseStatus.SUCCESS;
  data: any;
}

/**
 * Error response for invalid input or processing errors
 */
export interface ErrorResponse extends BaseServerResponse {
  status: ResponseStatus.ERROR | ResponseStatus.INVALID;
  errorMessage: string;
}

export interface CreateSessionResponse extends SuccessResponse {
  type: "create_session_response";
  data: {
    sessionId: string;
  };
}

/**
 * Initialize story response (acknowledges the request was queued)
 */
export interface InitializeStoryResponse extends SuccessResponse {
  type: "initialize_story_response";
}

/**
 * Make choice response (acknowledges the choice was queued)
 */
export interface MakeChoiceResponse extends SuccessResponse {
  type: "make_choice_response";
  data: {
    optionIndex: number;
  };
}

/**
 * Select character response (acknowledges the selection was queued)
 */
export interface SelectCharacterResponse extends SuccessResponse {
  type: "select_character_response";
  data: {
    identityIndex: number;
    backgroundIndex: number;
  };
}

/**
 * Verify code response - successful connection to game
 */
export interface VerifyCodeResponse extends SuccessResponse {
  type: "verify_code_response";
  data: {
    state: ClientStoryState;
  };
}

export interface ExitStoryResponse extends SuccessResponse {
  type: "exit_story_response";
  data: Record<string, never>; // Empty object
}

export type WSServerResponse =
  | CreateSessionResponse
  | InitializeStoryResponse
  | VerifyCodeResponse
  | SelectCharacterResponse
  | MakeChoiceResponse
  | ExitStoryResponse
  | RateLimitedResponse
  | ErrorResponse;

//
// ----- Notification Types (server-initiated events) -----
//

/**
 * Base interface for all server notifications
 */
export interface BaseServerNotification {
  type: string;
}

export interface StateUpdateNotification extends BaseServerNotification {
  type: "state_update_notification";
  state: ClientStoryState;
  trigger:
    | "story_update"
    | "game_progression"
    | "character_selection"
    | "player_choice";
}

export interface StoryCodesNotification extends BaseServerNotification {
  type: "story_codes_notification";
  gameId: string;
  codes: Record<string, string>;
}

export interface StoryReadyNotification extends BaseServerNotification {
  type: "story_ready_notification";
  gameId: string;
}

export interface ActivePlayersNotification extends BaseServerNotification {
  type: "active_players_notification";
  gameId: string;
  activePlayers: ActivePlayerStatus[];
}

export type ActivePlayerStatus = {
  playerSlot: PlayerSlot;
  isConnected: boolean;
  lastActive: Date;
};

/**
 * Game error notification
 */
export interface GameErrorNotification extends BaseServerNotification {
  type: "game_error_notification";
  gameId: string;
  error: string;
  operationType: string;
  details?: string;
}

export type WSServerNotification =
  | StateUpdateNotification
  | StoryCodesNotification
  | StoryReadyNotification
  | ActivePlayersNotification
  | GameErrorNotification;

export type WSServerMessage = WSServerResponse | WSServerNotification;
