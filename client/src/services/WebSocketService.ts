import { io, Socket } from "socket.io-client";
import type { WSServerMessage } from "../../../shared/types/websocket";
import type { ClientStoryState } from "../../../shared/types/story";
import { config } from "../config";

type MessageHandler = (data: WSServerMessage) => void;

type WSMessage = {
  type: string;
  [key: string]: unknown;
};

export class WebSocketService {
  private socket: Socket | null = null;
  private sessionId: string | null = null;
  private playerCode: string | null = null;
  private tabId: string;
  private messageHandlers = new Map<string, MessageHandler>();
  private isConnecting = false;
  private readonly MAX_RECONNECT_ATTEMPTS = 5;

  constructor() {
    this.tabId =
      sessionStorage.getItem("tabId") ||
      Math.random().toString(36).substring(2, 15);
    sessionStorage.setItem("tabId", this.tabId);

    const playerCodeKey = `playerCode_${this.tabId}`;
    this.playerCode = localStorage.getItem(playerCodeKey);
    this.sessionId = localStorage.getItem("sessionId");

    console.log("[WebSocketService] Initialized with:", {
      tabId: this.tabId,
      playerCode: this.playerCode,
      sessionId: this.sessionId,
    });
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

    if (this.socket?.connected) {
      if (this.sessionId === sessionId) {
        console.log(
          "[WebSocketService] Already connected with correct sessionId"
        );
        return;
      }
      this.disconnect();
    }

    this.isConnecting = true;
    this.sessionId = sessionId || null;

    const socketUrl = import.meta.env.PROD
      ? config.wsServerUrl
      : `${window.location.protocol}//${window.location.hostname}:${config.wsPort}`;
    console.log("[WebSocketService] Connecting to:", socketUrl);

    this.socket = io(socketUrl, {
      path: "/socket.io",
      reconnection: true,
      reconnectionAttempts: this.MAX_RECONNECT_ATTEMPTS,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    this.setupSocketHandlers();
  }

  private setupSocketHandlers() {
    if (!this.socket) return;

    this.socket.on("connect", () => {
      this.isConnecting = false;
      console.log("[WebSocketService] Connected to server with state:", {
        playerCode: this.playerCode,
        sessionId: this.sessionId,
        socketId: this.socket?.id,
      });

      if (this.playerCode) {
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
          "[WebSocketService] No existing session or code, creating new session"
        );
        this.socket?.emit("create_session");
      }
    });

    this.socket.on("disconnect", (reason) => {
      console.log("[WebSocketService] Disconnected:", {
        reason,
        playerCode: this.playerCode,
        sessionId: this.sessionId,
      });
    });

    // Handle session_created events
    this.socket.on("session_created", (data: { sessionId: string }) => {
      console.log("[WebSocketService] Session created event received:", data);
      const handler = this.messageHandlers.get("session_created");
      if (handler) {
        handler({ type: "session_created", sessionId: data.sessionId });
      }
    });

    // Handle state_update events
    this.socket.on("state_update", (data: { state: ClientStoryState }) => {
      const handler = this.messageHandlers.get("state_update");
      if (handler) {
        handler({ type: "state_update", state: data.state });
      }
    });

    // Add handler for story_codes events
    this.socket.on("story_codes", (data: { codes: Record<string, string> }) => {
      console.log("[WebSocketService] Player codes received:", data);
      const handler = this.messageHandlers.get("story_codes");
      if (handler) {
        handler({ type: "story_codes", codes: data.codes });
      }
    });

    // Handle exit_story_response events
    this.socket.on("exit_story_response", () => {
      const handler = this.messageHandlers.get("exit_story_response");
      if (handler) {
        handler({ type: "exit_story_response" });
      }
    });

    // Handle error events
    this.socket.on("error", (error: string) => {
      console.log("[WebSocketService] Socket error:", error);
      if (error === "Session not found" || error === "Invalid session") {
        this.sessionId = null;
        localStorage.removeItem("sessionId");
        this.socket?.emit("create_session");
      }
    });

    // Handle verify_code_response events
    this.socket.on(
      "verify_code_response",
      (data: { state: ClientStoryState | null; error?: string }) => {
        console.log("[WebSocketService] Code verification response:", data);
        const handler = this.messageHandlers.get("verify_code_response");
        if (handler) {
          handler({ type: "verify_code_response", ...data });
        }
      }
    );
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

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.sessionId = null;
    this.isConnecting = false;
  }

  setPlayerCode(code: string) {
    console.log("[WebSocketService] Setting player code:", code);
    this.playerCode = code;
    const playerCodeKey = `playerCode_${this.tabId}`;
    localStorage.setItem(playerCodeKey, code);
  }
}

export const wsService = new WebSocketService();
