import type { ClientStoryState } from "./story.js";
import type { PlayerSlot } from "./player.js";
import {
  ResponseStatus,
  BaseServerResponse,
  RateLimitedResponse,
  SuccessResponse,
  ErrorResponse,
} from "./api.js";

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
  userId?: string;
}

export interface ExitStoryMessage extends BaseClientMessage {
  type: "exit_story";
}

export type WSClientMessage =
  | CreateSessionMessage
  | JoinSessionMessage
  | MakeChoiceMessage
  | SelectCharacterMessage
  | VerifyCodeMessage
  | ExitStoryMessage;

// ===============================================
// Server -> Client message types
// ===============================================

// ----- Response Types (directly responding to client requests) -----

// Reuse ResponseStatus, BaseServerResponse, RateLimitedResponse, SuccessResponse, and ErrorResponse from api.ts

// Type augmented versions of the response types
export interface WSBaseServerResponse extends BaseServerResponse {
  type: string;
}

export interface WSRateLimitedResponse
  extends RateLimitedResponse,
    WSBaseServerResponse {
  status: ResponseStatus.RATE_LIMITED;
}

export interface WSSuccessResponse<T = unknown>
  extends SuccessResponse<T>,
    WSBaseServerResponse {
  status: ResponseStatus.SUCCESS;
}

export interface WSErrorResponse extends ErrorResponse, WSBaseServerResponse {
  status: ResponseStatus.ERROR | ResponseStatus.INVALID;
}

export interface CreateSessionResponse
  extends WSSuccessResponse<{ sessionId: string }> {
  type: "create_session_response";
}

/**
 * Make choice response (acknowledges the choice was queued)
 */
export interface MakeChoiceResponse
  extends WSSuccessResponse<{ optionIndex: number }> {
  type: "make_choice_response";
}

/**
 * Select character response (acknowledges the selection was queued)
 */
export interface SelectCharacterResponse
  extends WSSuccessResponse<{
    identityIndex: number;
    backgroundIndex: number;
  }> {
  type: "select_character_response";
}

/**
 * Verify code response - successful connection to game
 */
export interface VerifyCodeResponse
  extends WSSuccessResponse<{ code: string; state: ClientStoryState }> {
  type: "verify_code_response";
}

export interface ExitStoryResponse
  extends WSSuccessResponse<Record<string, never>> {
  type: "exit_story_response";
}

export type WSServerResponse =
  | CreateSessionResponse
  | VerifyCodeResponse
  | SelectCharacterResponse
  | MakeChoiceResponse
  | ExitStoryResponse
  | WSRateLimitedResponse
  | WSErrorResponse;

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
