import type { WSServerMessage, WSClientMessage } from "../../../shared/types/websocket";
import { config } from '../config';

type MessageHandler = (data: WSServerMessage) => void;

export class WebSocketService {
  private ws: WebSocket | null = null;
  private messageQueue: WSClientMessage[] = [];
  private sessionId: string | null = null;
  private messageHandlers = new Map<string, MessageHandler>();
  private onOpenHandler: (() => void) | null = null;
  private isConnecting = false;
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 5;
  private connectionTimeout: NodeJS.Timeout | null = null;
  private isCreatingSession = false;

  onOpen(handler: () => void) {
    this.onOpenHandler = handler;
  }

  setSessionId(sessionId: string) {
    this.sessionId = sessionId;
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  connect(sessionId?: string) {
    if (this.isConnecting) {
      console.log('[WebSocketService] Connection already in progress');
      return;
    }

    if (this.ws?.readyState === WebSocket.OPEN) {
      if (this.sessionId === sessionId) {
        console.log('[WebSocketService] WebSocket already connected with correct sessionId');
        return;
      }
      this.disconnect();
    }

    this.isConnecting = true;
    this.sessionId = sessionId || null;
    console.log('Connecting with sessionId:', this.sessionId);

    const wsUrl = `${window.location.protocol === "https:" ? "wss:" : "ws"}://${
      window.location.hostname
    }:${config.wsPort}/ws`;
    console.log('Attempting to connect to WebSocket at', wsUrl);
    
    this.ws = new WebSocket(wsUrl, ["story-protocol"]);

    this.ws.onopen = () => {
      this.isConnecting = false;
      console.log('[WebSocketService] WebSocket connected, readyState:', this.ws?.readyState);
      
      // Process any queued messages
      while (this.messageQueue.length > 0) {
        const message = this.messageQueue.shift();
        if (message) {
          this.sendMessage(message);
        }
      }

      this.reconnectAttempts = 0;
      if (this.onOpenHandler) {
        this.onOpenHandler();
      }
    };

    this.ws.onmessage = (event) => {
      console.log('Received message:', event.data);
      try {
        const data = JSON.parse(event.data) as WSServerMessage;
        if (data.type === "session_created") {
          this.isCreatingSession = false;
        }
        const handler = this.messageHandlers.get(data.type);
        if (handler) {
          handler(data);
        } else {
          console.warn('No handler for message type:', data.type);
        }
      } catch (error) {
        console.error("Error processing WebSocket message:", error);
      }
    };

    this.ws.onclose = (event) => {
      console.log(`WebSocket disconnected with code ${event.code}, reason:`, event.reason);
      if (this.connectionTimeout) {
        clearTimeout(this.connectionTimeout);
        this.connectionTimeout = null;
      }
      this.isConnecting = false;
      if (event.code !== 1000) {
        this.handleReconnect();
      }
    };

    this.ws.onerror = (error) => {
      console.error("WebSocket error:", error);
      this.isConnecting = false;
    };
  }

  initializeStory(prompt: string, generateImages: boolean) {
    if (!this.sessionId) {
      console.warn('Cannot initialize story: no sessionId');
      return;
    }
    
    const message: WSClientMessage = {
      type: "initialize_story",
      sessionId: this.sessionId,
      payload: { prompt, generateImages }
    };
    
    console.log('Initializing story:', message);
    this.sendMessage(message);
  }

  makeChoice(optionIndex: number) {
    if (!this.sessionId) {
      console.warn('[WebSocketService] Cannot make choice: no sessionId');
      return;
    }
    
    const message: WSClientMessage = {
      type: "make_choice",
      sessionId: this.sessionId,
      payload: { optionIndex }
    };
    
    console.log('[WebSocketService] Sending choice:', message);
    this.sendMessage(message);
  }

  onMessage(type: "session_created" | "state_update" | "error" | "exit_story_response", handler: MessageHandler) {
    this.messageHandlers.set(type, handler);
  }

  clearMessageHandlers() {
    this.messageHandlers.clear();
    this.onOpenHandler = null;
  }

  sendMessage(data: WSClientMessage) {
    // Prevent duplicate session creation requests
    if (data.type === "create_session" && this.isCreatingSession) {
      console.log('[WebSocketService] Session creation already in progress');
      return;
    }

    if (data.type === "create_session") {
      this.isCreatingSession = true;
    }

    if (this.ws?.readyState === WebSocket.OPEN) {
      console.log('[WebSocketService] Sending message:', data);
      this.ws.send(JSON.stringify(data));
    } else {
      console.log('[WebSocketService] Queuing message:', data);
      this.messageQueue.push(data);
    }
  }

  private handleReconnect() {
    if (
      this.reconnectAttempts < this.MAX_RECONNECT_ATTEMPTS &&
      this.sessionId
    ) {
      this.reconnectAttempts++;
      console.log(
        `Attempting to reconnect (${this.reconnectAttempts}/${this.MAX_RECONNECT_ATTEMPTS})...`
      );
      setTimeout(
        () => this.connect(this.sessionId!),
        1000 * this.reconnectAttempts
      );
    }
  }

  disconnect() {
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }
    if (this.ws) {
      this.ws.close(1000); // Normal closure
      this.ws = null;
    }
    this.sessionId = null;
    this.messageHandlers.clear();
    this.isConnecting = false;
    this.reconnectAttempts = 0;
    this.isCreatingSession = false;
  }

  exitStory() {
    const sessionId = this.sessionId;
    if (!sessionId) {
      console.warn('[WebSocketService] Cannot exit story: no sessionId');
      return;
    }
    
    const message: WSClientMessage = {
      type: "join", // Since exit_story isn't in the type, we'll use join for now
      sessionId
    };
    
    console.log('[WebSocketService] Sending exit story message:', message);
    this.sendMessage(message);
    // Don't disconnect the WebSocket, just clear the session
    this.sessionId = null;
  }
}

export const wsService = new WebSocketService();
