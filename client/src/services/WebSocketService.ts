import { io, Socket } from "socket.io-client";
import {
  WSServerMessage,
  ResponseStatus,
  StateUpdateNotification,
  StoryCodesNotification,
  GameErrorNotification,
  RateLimitInfo,
  StoryReadyNotification,
} from "../../../shared/types/websocket.js";
import { RateLimitedAction, SOCKET_CONFIG } from "../../../shared/config.js";
import type { ClientStoryState } from "../../../shared/types/story.js";
import { config } from "../config";

type MessageHandler = (data: WSServerMessage) => void;

type WSMessage = {
  type: string;
  [key: string]: unknown;
};

// Define server response types consistent with shared types
interface BaseResponse {
  type: string;
  status: ResponseStatus;
  requestId: string;
  timestamp: number;
}

interface SuccessResponse extends BaseResponse {
  status: ResponseStatus.SUCCESS;
  data: Record<string, unknown>;
}

interface ErrorResponse extends BaseResponse {
  status: ResponseStatus.ERROR | ResponseStatus.INVALID;
  errorMessage: string;
  operationType?: string; // Add this field to match our usage
}

interface RateLimitedResponse extends BaseResponse {
  status: ResponseStatus.RATE_LIMITED;
  rateLimit: {
    action: RateLimitedAction;
    timeRemaining: number;
    maxRequests: number;
    windowMs: number;
    requestsRemaining: number;
  };
}

type ServerResponse = SuccessResponse | ErrorResponse | RateLimitedResponse;

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
  private tabId: string;
  private messageHandlers = new Map<string, MessageHandler>();
  private isConnecting = false;
  private readonly MAX_RECONNECT_ATTEMPTS =
    SOCKET_CONFIG.CLIENT.reconnectionAttempts;
  private heartbeatInterval: number | null = null;
  private tabInactiveStartTime: number | null = null;
  // Track pending requests by their type
  private pendingRequests = new Set<string>();
  // Track background operations
  private backgroundOperations = new Set<string>();

  constructor() {
    this.tabId =
      sessionStorage.getItem("tabId") ||
      Math.random().toString(36).substring(2, 15);
    sessionStorage.setItem("tabId", this.tabId);

    const playerCodeKey = `playerCode_${this.tabId}`;
    this.playerCode = localStorage.getItem(playerCodeKey);
    this.sessionId = localStorage.getItem("sessionId");

    // Set up visibility change handler to detect tab switching
    this.setupVisibilityChangeHandler();

    console.log("[WebSocketService] Initialized with:", {
      tabId: this.tabId,
      playerCode: this.playerCode,
      sessionId: this.sessionId,
    });
  }

  // Set up handler for document visibility changes
  private setupVisibilityChangeHandler() {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        // Tab is now inactive - record the time
        this.tabInactiveStartTime = Date.now();
        console.log(
          "[WebSocketService] Tab inactive, timestamp:",
          this.tabInactiveStartTime
        );
      } else if (document.visibilityState === "visible") {
        // Tab is now active again
        if (this.tabInactiveStartTime) {
          const inactiveDuration = Date.now() - this.tabInactiveStartTime;
          console.log(
            "[WebSocketService] Tab active again after",
            inactiveDuration,
            "ms"
          );

          // If inactive for longer than our threshold, check connection
          if (inactiveDuration > SOCKET_CONFIG.STALE_CONNECTION_THRESHOLD_MS) {
            if (!this.socket?.connected) {
              console.log(
                "[WebSocketService] Connection stale after inactive period, showing reconnect message"
              );

              // Notify about stale connection
              const handler = this.messageHandlers.get("connection_stale");
              if (handler) {
                handler({
                  type: "connection_stale",
                  message:
                    "Connection lost while tab was inactive. Please refresh the page.",
                } as unknown as WSServerMessage);
              }
            } else {
              console.log(
                "[WebSocketService] Connection survived inactive period"
              );
            }
          }

          // Always check if we have pending operations
          const hasPendingOperations =
            this.pendingRequests.size > 0 || this.backgroundOperations.size > 0;

          if (hasPendingOperations && !this.socket?.connected) {
            console.log(
              "[WebSocketService] Reconnecting due to pending operations after visibility change"
            );
            this.connect();
          }

          this.tabInactiveStartTime = null;
        }
      }
    });
  }

  // Start heartbeat to keep connection alive
  private setupHeartbeat() {
    // Clear any existing heartbeat
    if (this.heartbeatInterval !== null) {
      clearInterval(this.heartbeatInterval);
    }

    // Setup new heartbeat
    this.heartbeatInterval = window.setInterval(() => {
      if (this.socket?.connected) {
        console.log("[WebSocketService] Sending heartbeat");
        this.socket.emit("heartbeat", { sessionId: this.sessionId });
      }
    }, SOCKET_CONFIG.CLIENT.heartbeatInterval);
  }

  private clearHeartbeat() {
    if (this.heartbeatInterval !== null) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  // Track a request that's waiting for a response
  addPendingRequest(requestType: string): void {
    this.pendingRequests.add(requestType);
    console.log(`[WebSocketService] Added pending request: ${requestType}`);
  }

  // Remove a request from pending
  removePendingRequest(requestType: string): void {
    this.pendingRequests.delete(requestType);
    console.log(`[WebSocketService] Removed pending request: ${requestType}`);
  }

  // Check if a request is pending
  isRequestPending(requestType: string): boolean {
    return this.pendingRequests.has(requestType);
  }

  // Add a background operation
  addBackgroundOperation(operationType: string): void {
    this.backgroundOperations.add(operationType);
    console.log(
      `[WebSocketService] Added background operation: ${operationType}`
    );
  }

  // Remove a background operation
  removeBackgroundOperation(operationType: string): void {
    this.backgroundOperations.delete(operationType);
    console.log(
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
    this.sessionId = sessionId;
  }

  isConnected(): boolean {
    return this.socket?.connected || false;
  }

  connect(sessionId?: string) {
    if (this.isConnecting) {
      console.log("[WebSocketService] Connection already in progress");
      return;
    }

    // Set the session ID if provided, but don't overwrite existing one
    if (sessionId && !this.sessionId) {
      this.sessionId = sessionId;
    }

    // Don't disconnect if already connected with the correct session ID
    if (this.socket?.connected) {
      if (this.sessionId === sessionId || !sessionId) {
        console.log(
          "[WebSocketService] Already connected with correct sessionId"
        );
        return;
      }
      // Only disconnect if we need to use a different session ID
      console.log(
        "[WebSocketService] Disconnecting to reconnect with a different sessionId"
      );
      this.disconnect();
    }

    this.isConnecting = true;

    const socketUrl = import.meta.env.PROD
      ? config.wsServerUrl
      : `${window.location.protocol}//${window.location.hostname}:${config.wsPort}`;
    console.log("[WebSocketService] Connecting to:", socketUrl);

    // Use WebSocket only (no polling) to prevent transport changes
    // This eliminates the polling->websocket upgrade cycle which can cause disconnects
    this.socket = io(socketUrl, {
      path: "/socket.io",
      reconnection: true,
      reconnectionAttempts: this.MAX_RECONNECT_ATTEMPTS,
      reconnectionDelay: SOCKET_CONFIG.CLIENT.reconnectionDelay,
      reconnectionDelayMax: SOCKET_CONFIG.CLIENT.reconnectionDelayMax,
      timeout: SOCKET_CONFIG.CLIENT.timeout, // Use the 3-minute timeout
      forceNew: false,
    });

    this.setupSocketHandlers();
    this.setupHeartbeat();
  }

  private setupSocketHandlers() {
    if (!this.socket) return;

    // Add low-level socket transport error handlers
    this.socket.io.engine.on("error", (err) => {
      console.error("[WebSocketService] Transport error:", err);
    });

    this.socket.io.engine.on("close", (reason) => {
      console.log("[WebSocketService] Transport closed:", reason);
    });

    this.socket.on("connect_error", (error) => {
      console.error("[WebSocketService] Connection error:", error.message);
    });

    this.socket.on("connect", () => {
      this.isConnecting = false;
      console.log("[WebSocketService] Connected to server with state:", {
        playerCode: this.playerCode,
        sessionId: this.sessionId,
        socketId: this.socket?.id,
      });

      if (this.playerCode) {
        // Check if the player code is still in localStorage
        const playerCodeKey = `playerCode_${this.tabId}`;
        const storedCode = localStorage.getItem(playerCodeKey);

        if (storedCode === this.playerCode) {
          console.log(
            "[WebSocketService] Attempting to reconnect with player code:",
            this.playerCode
          );
          this.sendMessage({
            type: "verify_code",
            sessionId: this.sessionId || "",
            code: this.playerCode,
          });
        } else {
          console.log(
            "[WebSocketService] Player code no longer valid, creating new session"
          );
          this.playerCode = null;
          this.sendMessage({ type: "create_session" });
        }
      } else if (!this.sessionId) {
        console.log(
          "[WebSocketService] No existing session or code, creating new session"
        );
        this.sendMessage({ type: "create_session" });
      } else {
        console.log(
          "[WebSocketService] Already have sessionId, no need to create session"
        );
      }
    });

    this.socket.on("disconnect", (reason) => {
      console.log("[WebSocketService] Disconnected:", {
        reason,
        playerCode: this.playerCode,
        sessionId: this.sessionId,
      });

      // If we have a pending request, we want to reconnect quickly
      const hasPendingOperation =
        this.pendingRequests.size > 0 || this.backgroundOperations.size > 0;

      if (hasPendingOperation) {
        console.log(
          "[WebSocketService] Reconnecting due to disconnect with pending operations"
        );

        // Don't reset the isConnecting flag so it will reconnect through our connect method
        this.socket = null;

        // Let the socket reconnect automatically (through the socket.io reconnection mechanism)
        // rather than calling connect() manually, which could cause double reconnection
      }
    });

    // Handle state_update_notification events - new format
    this.socket.on(
      "state_update_notification",
      (data: StateUpdateNotification) => {
        // console.log(
        //   "[WebSocketService] Received state_update_notification:",
        //   data
        // );

        // If this is a state update after character selection, clean up the pending request
        if (
          data.state.characterSelectionCompleted &&
          (this.pendingRequests.has("select_character") ||
            this.isOperationRunning("select_character"))
        ) {
          console.log(
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
        console.log(
          "[WebSocketService] Player codes notification received:",
          data
        );
        const handler = this.messageHandlers.get("story_codes_notification");
        if (handler) {
          handler(data);
        } else {
          console.warn("[WebSocketService] No handler for story_codes");
        }
      }
    );

    // Handle response messages (including rate limits)
    this.socket.on("response", (data: ServerResponse) => {
      console.log("[WebSocketService] Response received:", data);

      if (!data.type || !data.status) {
        console.warn("[WebSocketService] Received malformed response:", data);
        return;
      }

      // Remove from pending requests based on the response type
      // E.g., "initialize_story_response" -> "initialize_story"
      const requestType = data.type.replace("_response", "");
      this.removePendingRequest(requestType);

      // Handle rate limited responses
      if (data.status === ResponseStatus.RATE_LIMITED) {
        console.log(
          "[WebSocketService] Rate limited:",
          (data as RateLimitedResponse).rateLimit
        );
        const handler = this.messageHandlers.get("rate_limited");
        if (handler) {
          handler(
            createRateLimitedMessage((data as RateLimitedResponse).rateLimit)
          );
        }
        return;
      }

      // Handle success responses
      if (data.status === ResponseStatus.SUCCESS) {
        // For init story success, add to background operations
        if (data.type === "initialize_story_response") {
          console.log(
            "[WebSocketService] Story initialization queued, adding background operation"
          );
          this.addBackgroundOperation("initialize_story");
        }
        // For select_character_response, add to background operations
        else if (data.type === "select_character_response") {
          console.log(
            "[WebSocketService] Character selection queued, adding background operation"
          );
          this.addBackgroundOperation("select_character");
        }
        // For create_session_response, update the sessionId
        else if (
          data.type === "create_session_response" &&
          (data as SuccessResponse).data &&
          "sessionId" in (data as SuccessResponse).data
        ) {
          this.sessionId = (data as SuccessResponse).data.sessionId as string;
          localStorage.setItem("sessionId", this.sessionId);
        }

        // Call the appropriate success handler
        const handler = this.messageHandlers.get(data.type);
        if (handler) {
          handler(
            createSuccessResponse(data.type, (data as SuccessResponse).data)
          );
        }
        return;
      }

      // Handle error responses
      if (
        data.status === ResponseStatus.ERROR ||
        data.status === ResponseStatus.INVALID
      ) {
        const errorData = data as ErrorResponse;
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
          console.log("[WebSocketService] Socket error:", errorData);
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
          console.log(
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
        console.log(
          "[WebSocketService] Story ready notification received:",
          data
        );

        // Clear any pending background initialize_story operation
        if (this.isOperationRunning("initialize_story")) {
          console.log(
            "[WebSocketService] Clearing initialize_story background operation after story ready"
          );
          this.removeBackgroundOperation("initialize_story");
        }

        const handler = this.messageHandlers.get("story_ready_notification");
        if (handler) {
          handler(data);
        } else {
          console.warn(
            "[WebSocketService] No handler for story_ready_notification"
          );
        }
      }
    );

    // Handle verify_code_response events
    this.socket.on(
      "verify_code_response",
      (data: { state: ClientStoryState | null; error?: string }) => {
        console.log("[WebSocketService] Code verification response:", data);

        // If there's an error, clear the player code
        if (data.error) {
          console.log(
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

    // Add heartbeat response handler
    this.socket?.on("heartbeat", () => {
      console.log("[WebSocketService] Received heartbeat response");
    });
  }

  onMessage(type: string, handler: MessageHandler) {
    this.messageHandlers.set(type, handler);
  }

  clearMessageHandlers() {
    this.messageHandlers.clear();
  }

  sendMessage(message: WSMessage) {
    console.log("[WebSocketService] Sending message:", {
      type: message.type,
      socketId: this.socket?.id,
      connected: this.socket?.connected,
    });
    if (!this.socket?.connected) {
      console.warn("[WebSocketService] Cannot send message: not connected");
      return;
    }

    // Add to pending requests
    this.addPendingRequest(message.type);

    const messageWithSession = {
      ...message,
      sessionId: this.sessionId,
    };

    this.socket.emit(message.type, messageWithSession);
  }

  clearSession() {
    console.log("[WebSocketService] Clearing session:", {
      oldPlayerCode: this.playerCode,
      oldSessionId: this.sessionId,
    });

    // Don't clear the player code as it might be needed for resuming
    this.sessionId = null;
    localStorage.removeItem("sessionId");
  }

  handleExitStoryResponse() {
    this.socket?.emit("leave_session", this.sessionId);
    this.clearSession();
  }

  disconnect(clearCode = false) {
    this.clearHeartbeat();

    if (this.socket) {
      console.log("[WebSocketService] Manually disconnecting socket:", {
        socketId: this.socket.id,
        connected: this.socket.connected,
        pendingRequests: Array.from(this.pendingRequests),
        clearCode,
      });
      this.socket.disconnect();
      this.socket = null;
    }
    this.sessionId = null;
    this.isConnecting = false;

    if (clearCode) {
      this.clearPlayerCode();
    }
  }

  clearPlayerCode() {
    console.log("[WebSocketService] Clearing player code:", this.playerCode);
    this.playerCode = null;
    const playerCodeKey = `playerCode_${this.tabId}`;
    localStorage.removeItem(playerCodeKey);
  }

  setPlayerCode(code: string) {
    console.log("[WebSocketService] Setting player code:", code);
    this.playerCode = code;
    const playerCodeKey = `playerCode_${this.tabId}`;
    localStorage.setItem(playerCodeKey, code);
  }
}

export const wsService = new WebSocketService();
