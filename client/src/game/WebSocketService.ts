import { io, Socket } from "socket.io-client";
import {
  WSServerMessage,
  ResponseStatus,
  StateUpdateNotification,
  StoryCodesNotification,
  GameErrorNotification,
  RateLimitInfo,
  StoryReadyNotification,
  WSSuccessResponse,
  WSErrorResponse,
  WSRateLimitedResponse,
} from "core/types";
import { SOCKET_CONFIG } from "core/config";
import type { ClientStoryState } from "core/types";
import { Logger } from "shared/logger";
import { config } from "client/config";

type MessageHandler = (data: WSServerMessage) => void;

type WSMessage = {
  type: string;
  [key: string]: unknown;
};

// Extended ContentModerationResponse with type field for internal use
// Define a more specific server response type for internal use
type ServerResponse =
  | WSSuccessResponse<Record<string, unknown>>
  | WSErrorResponse
  | WSRateLimitedResponse;

// Helper functions to create properly typed WSServerMessage objects
function createRateLimitedMessage(rateLimit: RateLimitInfo): WSServerMessage {
  // This is for the custom format expected by SessionProvider
  return {
    type: "rate_limited",
    rateLimit,
  } as unknown as WSServerMessage;
}

function createErrorMessage(
  errorMessage: string,
  operationType?: string
): GameErrorNotification {
  return {
    type: "game_error_notification",
    gameId: "unknown",
    error: errorMessage,
    operationType: operationType || "unknown",
  };
}

function createVerifyCodeMessage(
  state?: ClientStoryState,
  error?: string
): WSServerMessage {
  if (error) {
    // Return an error message
    return createErrorMessage(error, "verify_code");
  }

  if (state) {
    // Return a success response
    return {
      type: "verify_code_response",
      status: ResponseStatus.SUCCESS,
      data: { state },
      requestId: generateRequestId(),
      timestamp: Date.now(),
    } as unknown as WSServerMessage;
  }

  // Default error case
  return createErrorMessage("Verification failed", "verify_code");
}

function createExitStoryMessage(): WSServerMessage {
  return {
    type: "exit_story_response",
    status: ResponseStatus.SUCCESS,
    data: {},
    requestId: generateRequestId(),
    timestamp: Date.now(),
  } as unknown as WSServerMessage;
}

// Generate a unique request ID for responses we create client-side
function generateRequestId(): string {
  return Math.random().toString(36).substring(2, 15);
}

function createSuccessResponse(type: string, data: unknown): WSServerMessage {
  return {
    type: type,
    status: ResponseStatus.SUCCESS,
    data: data,
    requestId: generateRequestId(),
    timestamp: Date.now(),
  } as unknown as WSServerMessage;
}

export class WebSocketService {
  private socket: Socket | null = null;
  private sessionId: string | null = null;
  private playerCode: string | null = null;
  private messageHandlers = new Map<string, MessageHandler>();
  private isConnecting = false;
  private readonly MAX_RECONNECT_ATTEMPTS =
    SOCKET_CONFIG.CLIENT.reconnectionAttempts;
  // Track pending requests by their type
  private pendingRequests = new Set<string>();
  // Track background operations
  private backgroundOperations = new Set<string>();
  private onConnectSubscribers: Array<() => void> = [];
  private onDisconnectSubscribers: Array<(reason: string) => void> = [];

  constructor() {
    Logger.WebSocket.log(
      "[WebSocketService] Initialized with (sessionId will be set via connect/setSessionId):",
      {
        playerCode: this.playerCode,
        sessionId: this.sessionId,
      }
    );
  }

  // Track a request that's waiting for a response
  addPendingRequest(requestType: string): void {
    this.pendingRequests.add(requestType);
    Logger.WebSocket.log(
      `[WebSocketService] Added pending request: ${requestType}`
    );
  }

  // Remove a request from pending
  removePendingRequest(requestType: string): void {
    this.pendingRequests.delete(requestType);
    Logger.WebSocket.log(
      `[WebSocketService] Removed pending request: ${requestType}`
    );
  }

  // Check if a request is pending
  isRequestPending(requestType: string): boolean {
    return this.pendingRequests.has(requestType);
  }

  // Add a background operation
  addBackgroundOperation(operationType: string): void {
    this.backgroundOperations.add(operationType);
    Logger.WebSocket.log(
      `[WebSocketService] Added background operation: ${operationType}`
    );
  }

  // Remove a background operation
  removeBackgroundOperation(operationType: string): void {
    this.backgroundOperations.delete(operationType);
    Logger.WebSocket.log(
      `[WebSocketService] Removed background operation: ${operationType}`
    );
  }

  // Check if an operation is running in the background
  isOperationRunning(operationType: string): boolean {
    return this.backgroundOperations.has(operationType);
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  setSessionId(sessionId: string) {
    const oldSessionId = this.sessionId;
    this.sessionId = sessionId;
    Logger.WebSocket.log(
      `[WebSocketService] SessionId explicitly set from ${oldSessionId} to: ${sessionId}`
    );
  }

  isConnected(): boolean {
    return this.socket?.connected || false;
  }

  connect(sessionIdToUse?: string) {
    const currentSocketId = this.socket?.id;
    Logger.WebSocket.log(
      `[WebSocketService] connect() called. Current this.sessionId: ${
        this.sessionId
      }, sessionIdToUse: ${sessionIdToUse}, current socket ID: ${currentSocketId}, isConnecting: ${
        this.isConnecting
      }, isConnected: ${this.isConnected()}`
    );

    if (this.isConnecting && !sessionIdToUse) {
      Logger.WebSocket.log(
        "[WebSocketService] Connection already in progress (isConnecting=true) and no new sessionId provided. Aborting this connect() call."
      );
      return;
    }

    if (
      this.socket?.connected &&
      sessionIdToUse &&
      this.sessionId !== sessionIdToUse
    ) {
      Logger.WebSocket.log(
        `[WebSocketService] SessionId will change from ${this.sessionId} to ${sessionIdToUse}. Disconnecting existing socket ${this.socket.id} to ensure fresh connection context.`
      );
      this.disconnect();
    } else if (this.socket?.connected && !this.isConnecting) {
      if (sessionIdToUse === undefined && this.sessionId !== null) {
        Logger.WebSocket.log(
          `[WebSocketService] connect() called without sessionIdToUse, but already connected with socket ${this.socket.id} and sessionId ${this.sessionId}. Keeping existing socket.`
        );
      } else {
        Logger.WebSocket.log(
          `[WebSocketService] Already connected with socket ${this.socket.id} and sessionId ${this.sessionId} (or no change dictated by sessionIdToUse '${sessionIdToUse}'). Not creating new socket.`
        );
      }
      this.onConnectSubscribers.forEach((handler) => handler());
      return;
    }

    this.sessionId = sessionIdToUse || this.sessionId;
    Logger.WebSocket.log(
      `[WebSocketService] Proceeding to establish connection. Target sessionId: ${this.sessionId}`
    );

    this.isConnecting = true;

    const socketUrl = import.meta.env.PROD
      ? config.wsServerUrl
      : `${window.location.protocol}//${window.location.hostname}:${config.wsPort}`;
    Logger.WebSocket.log("[WebSocketService] Connecting to URL:", socketUrl);
    Logger.WebSocket.log(
      "[WebSocketService] Creating new io() socket instance."
    );

    this.socket = io(socketUrl, {
      path: "/socket.io",
      reconnection: true,
      reconnectionAttempts: this.MAX_RECONNECT_ATTEMPTS,
      reconnectionDelay: SOCKET_CONFIG.CLIENT.reconnectionDelay,
      reconnectionDelayMax: SOCKET_CONFIG.CLIENT.reconnectionDelayMax,
      timeout: SOCKET_CONFIG.CLIENT.timeout,
      forceNew: false,
    });

    this.setupSocketHandlers();
  }

  private setupSocketHandlers() {
    if (!this.socket) return;

    // Add low-level socket transport error handlers
    this.socket.io.engine.on("error", (err) => {
      Logger.WebSocket.error("[WebSocketService] Transport error:", err);
    });

    this.socket.io.engine.on("close", (reason) => {
      Logger.WebSocket.log("[WebSocketService] Transport closed:", reason);
    });

    this.socket.on("connect_error", (error) => {
      Logger.WebSocket.error(
        "[WebSocketService] Connection failed:",
        error.message
      );
      this.isConnecting = false;
    });

    this.socket.on("connect", () => {
      Logger.WebSocket.log(
        `[WebSocketService] Connected successfully. Socket ID: ${this.socket?.id}`
      );
      this.isConnecting = false;
      // Notify subscribers
      this.onConnectSubscribers.forEach((handler) => handler());

      if (this.sessionId) {
        Logger.WebSocket.log(
          "[WebSocketService] Reconnected. Attempting to rejoin session:",
          this.sessionId
        );
        this.sendMessage({
          type: "rejoin_session",
          sessionId: this.sessionId,
          playerCode: this.playerCode,
        });
      } else {
        Logger.WebSocket.log(
          "[WebSocketService] Connected without a session ID. Waiting for session creation."
        );
        // If a 'create_session' was pending from a *previous* socket instance
        // that died, the 'pendingRequests' set still has 'create_session'.
        // Clearing it allows a new attempt on this new connection.
        if (this.pendingRequests.has("create_session")) {
          Logger.WebSocket.warn(
            "[WebSocketService] Clearing stale 'create_session' from pendingRequests on new connection without session."
          );
          this.removePendingRequest("create_session");
        }
      }
    });

    this.socket.on("disconnect", (reason) => {
      Logger.WebSocket.log("[WebSocketService] Disconnected:", reason);
      this.isConnecting = false;
      // Notify subscribers
      this.onDisconnectSubscribers.forEach((handler) => handler(reason));

      if (reason === "io server disconnect") {
        this.socket?.connect();
      } else if (reason === "io client disconnect") {
        Logger.WebSocket.log(
          "[WebSocketService] Disconnected by client intentionally."
        );
      }
    });

    // Handle state_update_notification events - new format
    this.socket.on(
      "state_update_notification",
      (data: StateUpdateNotification) => {
        // If this is a state update after character selection, clean up the pending request
        if (
          data.state.characterSelectionCompleted &&
          (this.pendingRequests.has("select_character") ||
            this.isOperationRunning("select_character"))
        ) {
          Logger.WebSocket.log(
            "[WebSocketService] Clearing pending select_character operations after state update notification"
          );
          this.removePendingRequest("select_character");
          this.removeBackgroundOperation("select_character");
        }

        const handler = this.messageHandlers.get("state_update_notification");
        if (handler) {
          handler(data);
        }
      }
    );

    // Add handler for story_codes events
    this.socket.on(
      "story_codes_notification",
      (data: StoryCodesNotification) => {
        Logger.WebSocket.log(
          "[WebSocketService] Story codes notification:",
          data
        );
      }
    );

    // Handle request response messages (including rate limits)
    this.socket.on("response", (data: ServerResponse) => {
      // Logger.WebSocket.log(
      //   "[WebSocketService] RAW RESPONSE RECEIVED FROM SERVER:",
      //   JSON.stringify(data) // Removed verbose raw log
      // );
      Logger.WebSocket.log(
        "[WebSocketService] Response received (parsed):",
        data
      );

      if (!data.status) {
        Logger.WebSocket.warn(
          "[WebSocketService] Received malformed response:",
          data
        );
        return;
      }

      // Remove from pending requests based on the response type
      // E.g., "initialize_story_response" -> "initialize_story"
      const requestType = data.type.replace("_response", "");
      this.removePendingRequest(requestType);

      // Handle rate limited responses
      if (data.status === ResponseStatus.RATE_LIMITED) {
        Logger.WebSocket.log(
          "[WebSocketService] Rate limited:",
          data.rateLimit
        );
        const handler = this.messageHandlers.get("rate_limited");
        if (handler) {
          handler(createRateLimitedMessage(data.rateLimit));
        }
        return;
      }

      // Handle success responses
      if (data.status === ResponseStatus.SUCCESS) {
        // For init story success, add to background operations
        if (data.type === "initialize_story_response") {
          Logger.WebSocket.log(
            "[WebSocketService] Story initialization queued, adding background operation"
          );
          this.removePendingRequest("initialize_from_template");
          this.addBackgroundOperation("initialize_story");
        }
        // For select_character_response, add to background operations
        else if (data.type === "select_character_response") {
          Logger.WebSocket.log(
            "[WebSocketService] Character selection queued, adding background operation"
          );
          this.addBackgroundOperation("select_character");
        }
        // For create_session_response, update the sessionId
        else if (
          data.type === "create_session_response" &&
          (data as WSSuccessResponse).data &&
          "sessionId" in data.data
        ) {
          this.sessionId = data.data.sessionId as string;
          localStorage.setItem("sessionId", this.sessionId);
        }

        // Call the appropriate success handler
        const handler = this.messageHandlers.get(data.type);
        if (handler) {
          handler(
            createSuccessResponse(data.type, (data as WSSuccessResponse).data)
          );
        }
        return;
      }

      // Handle error responses
      if (
        data.status === ResponseStatus.ERROR ||
        data.status === ResponseStatus.INVALID
      ) {
        const errorData = data as WSErrorResponse;
        const handler = this.messageHandlers.get("error");
        if (handler) {
          const errorInfo: GameErrorNotification = createErrorMessage(
            errorData.errorMessage,
            requestType
          );
          handler(errorInfo);
        }
      }
    });

    // Handle exit_story_response events
    this.socket.on("exit_story_response", () => {
      const handler = this.messageHandlers.get("exit_story_response");
      if (handler) {
        handler(createExitStoryMessage());
      }
    });

    // Handle error events
    this.socket.on(
      "error",
      (errorData: string | { error: string; operationType?: string }) => {
        // Handle string errors (backward compatibility)
        if (typeof errorData === "string") {
          Logger.WebSocket.log("[WebSocketService] Socket error:", errorData);
          if (
            errorData === "Session not found" ||
            errorData === "Invalid session"
          ) {
            this.sessionId = null;
            localStorage.removeItem("sessionId");
            this.socket?.emit("create_session");
          }

          // Forward string errors to any registered handlers
          const handler = this.messageHandlers.get("error");
          if (handler) {
            const errorInfo: GameErrorNotification = createErrorMessage(
              errorData,
              "unknown"
            );
            handler(errorInfo);
          }
        }
        // Handle new error object format
        else {
          Logger.WebSocket.log(
            "[WebSocketService] Socket error:",
            errorData.error,
            errorData.operationType ? `(${errorData.operationType})` : ""
          );
          if (
            errorData.error === "Session not found" ||
            errorData.error === "Invalid session"
          ) {
            this.sessionId = null;
            localStorage.removeItem("sessionId");
            this.socket?.emit("create_session");
          }

          // Forward the error to any registered handlers
          const handler = this.messageHandlers.get("error");
          if (handler) {
            const errorInfo: GameErrorNotification = createErrorMessage(
              errorData.error,
              errorData.operationType || "unknown"
            );
            handler(errorInfo);
          }
        }
      }
    );

    // Handle story_ready_notification events
    this.socket.on(
      "story_ready_notification",
      (data: StoryReadyNotification) => {
        Logger.WebSocket.log(
          "[WebSocketService] Story ready notification received:",
          data
        );

        // Clear any pending background initialize_story operation
        if (this.isOperationRunning("initialize_story")) {
          Logger.WebSocket.log(
            "[WebSocketService] Clearing initialize_story background operation after story ready"
          );
          this.removeBackgroundOperation("initialize_story");
        }

        const handler = this.messageHandlers.get("story_ready_notification");
        if (handler) {
          handler(data);
        } else {
          Logger.WebSocket.warn(
            "[WebSocketService] No handler for story_ready_notification"
          );
        }
      }
    );

    // Handle verify_code_response events
    this.socket.on(
      "verify_code_response",
      (data: { state: ClientStoryState | null; error?: string }) => {
        Logger.WebSocket.log(
          "[WebSocketService] Code verification response:",
          data
        );

        // If there's an error, clear the player code
        if (data.error) {
          Logger.WebSocket.log(
            "[WebSocketService] Code verification failed:",
            data.error
          );
          this.clearPlayerCode();
        }

        const handler = this.messageHandlers.get("verify_code_response");
        if (handler) {
          handler(createVerifyCodeMessage(data.state || undefined, data.error));
        }
      }
    );

    // Centralized message handler for all messages from the server
    this.socket.on("message", (data: WSServerMessage) => {
      Logger.WebSocket.log("[WebSocketService] Received message:", data);

      if (data.type && this.messageHandlers.has(data.type)) {
        this.messageHandlers.get(data.type)?.(data);
      } else {
        Logger.WebSocket.log(
          `[WebSocketService] No specific handler for message type: ${data.type}`
        );
      }

      if (
        data.type.endsWith("_response") ||
        data.type.endsWith("_notification")
      ) {
        let operationType = "";
        // Check if operationType exists on data and is a string
        if (data && typeof data === "object" && "operationType" in data) {
          // More specific check for operationType
          const potentialOpType = (data as { operationType?: unknown })
            .operationType;
          if (typeof potentialOpType === "string") {
            operationType = potentialOpType;
          }
        }
        // Fallback if operationType is not found or not a string
        if (!operationType) {
          operationType = data.type.replace(/_response$|_notification$/, "");
        }

        if (operationType && this.isRequestPending(operationType)) {
          this.removePendingRequest(operationType);
        }
      }
    });
  }

  onMessage(type: string, handler: MessageHandler) {
    this.messageHandlers.set(type, handler);
  }

  clearMessageHandlers() {
    this.messageHandlers.clear();
  }

  sendMessage(message: WSMessage) {
    if (!this.socket || !this.socket.connected) {
      Logger.WebSocket.error(
        "[WebSocketService] Cannot send message: Not connected."
      );
      return;
    }

    const eventType = message.type;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { type, ...payloadFields } = message;
    const payload = {
      ...payloadFields,
      sessionId: this.sessionId, // Ensure sessionId is part of the payload
    };

    Logger.WebSocket.log(
      `[WebSocketService] Sending event '${eventType}' on socket ${this.socket.id} with payload:`,
      payload
    );
    this.socket.emit(eventType, payload);

    if (
      !eventType.endsWith("_response") &&
      !eventType.endsWith("_notification")
    ) {
      this.addPendingRequest(eventType);
    }
  }

  clearSession() {
    this.sessionId = null;
    this.playerCode = null;
    localStorage.removeItem("sessionId");
    Logger.WebSocket.log("[WebSocketService] Session cleared.");
  }

  handleExitStoryResponse() {
    this.clearPlayerCode();
  }

  disconnect(clearCode = false) {
    if (this.socket) {
      Logger.WebSocket.log("[WebSocketService] Disconnecting...");
      this.socket.disconnect();
    }
    this.socket = null;
    this.isConnecting = false;
    if (clearCode) {
      this.clearPlayerCode();
    }
  }

  clearPlayerCode() {
    this.playerCode = null;
    Logger.WebSocket.log("[WebSocketService] Player code cleared internally.");
  }

  setPlayerCode(code: string) {
    this.playerCode = code;
    Logger.WebSocket.log(
      "[WebSocketService] Player code set internally to:",
      code
    );
  }

  public setExternalJoinCode(code: string | null): void {
    Logger.WebSocket.log(
      "[WebSocketService] Setting external join code, which now updates internal playerCode:",
      code
    );
    this.playerCode = code;
  }

  // Method for components to subscribe to the raw connect event
  public subscribeToConnect(handler: () => void) {
    this.onConnectSubscribers.push(handler);
  }

  public unsubscribeFromConnect(handler: () => void) {
    this.onConnectSubscribers = this.onConnectSubscribers.filter(
      (sub) => sub !== handler
    );
  }

  // Method for components to subscribe to the raw disconnect event
  public subscribeToDisconnect(handler: (reason: string) => void) {
    this.onDisconnectSubscribers.push(handler);
  }

  public unsubscribeFromDisconnect(handler: (reason: string) => void) {
    this.onDisconnectSubscribers = this.onDisconnectSubscribers.filter(
      (sub) => sub !== handler
    );
  }
}

export const wsService = new WebSocketService();
