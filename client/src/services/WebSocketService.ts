import { io, Socket } from "socket.io-client";
import type { WSServerMessage } from "../../../shared/types/websocket";
import type { StoryState } from "../../../shared/types/story";
import { config } from '../config';

type MessageHandler = (data: WSServerMessage) => void;

type WSMessage = {
  type: string;
  [key: string]: unknown;
};

export class WebSocketService {
  private socket: Socket | null = null;
  private sessionId: string | null = null;
  private messageHandlers = new Map<string, MessageHandler>();
  private isConnecting = false;
  private readonly MAX_RECONNECT_ATTEMPTS = 5;

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
      console.log('[WebSocketService] Connection already in progress');
      return;
    }

    if (this.socket?.connected) {
      if (this.sessionId === sessionId) {
        console.log('[WebSocketService] Already connected with correct sessionId');
        return;
      }
      this.disconnect();
    }

    this.isConnecting = true;
    this.sessionId = sessionId || null;

    const socketUrl = `${window.location.protocol}//${window.location.hostname}:${config.wsPort}`;
    console.log('[WebSocketService] Connecting to:', socketUrl);
    
    this.socket = io(socketUrl, {
      path: "/socket.io",
      reconnection: true,
      reconnectionAttempts: this.MAX_RECONNECT_ATTEMPTS,
      reconnectionDelay: 1000,
    });

    this.setupSocketHandlers();
  }

  private setupSocketHandlers() {
    if (!this.socket) return;

    this.socket.on("connect", () => {
      this.isConnecting = false;
      console.log('[WebSocketService] Connected');
      
      if (this.sessionId) {
        console.log('[WebSocketService] Joining session:', this.sessionId);
        this.socket?.emit("join_session", this.sessionId);
      } else {
        console.log('[WebSocketService] Creating new session');
        this.socket?.emit("create_session");
      }
    });

    this.socket.on("disconnect", () => {
      console.log('[WebSocketService] Disconnected');
    });

    // Handle session_created events
    this.socket.on("session_created", (data: { sessionId: string }) => {
      console.log('[WebSocketService] Session created event received:', data);
      const handler = this.messageHandlers.get("session_created");
      if (handler) {
        handler({ type: "session_created", sessionId: data.sessionId });
      }
    });

    // Handle state_update events
    this.socket.on("state_update", (data: { state: StoryState }) => {
      const handler = this.messageHandlers.get("state_update");
      if (handler) {
        handler({ type: "state_update", state: data.state });
      }
    });

    // Add handler for story_codes events
    this.socket.on("story_codes", (data: { codes: Record<string, string> }) => {
      console.log('[WebSocketService] Story codes received:', data);
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
    this.socket.on("error", (data: { error: string }) => {
      console.log('[WebSocketService] Error received:', data.error);
      const handler = this.messageHandlers.get("error");
      if (handler) {
        handler({ type: "error", error: data.error });
      }
      
      if (data.error === "Session not found" && this.sessionId) {
        console.log('[WebSocketService] Clearing invalid session');
        this.clearSession();
        this.socket?.emit("create_session");
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
    if (!this.socket?.connected) {
      console.warn('[WebSocketService] Cannot send message: not connected');
      return;
    }
    
    const messageWithSession = {
      ...message,
      sessionId: this.sessionId
    };
    
    this.socket.emit(message.type, messageWithSession);
  }

  clearSession() {
    this.sessionId = null;
    localStorage.removeItem('sessionId');
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.sessionId = null;
    this.isConnecting = false;
  }
}

export const wsService = new WebSocketService();
