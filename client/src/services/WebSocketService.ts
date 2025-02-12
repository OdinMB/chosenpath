import type { WSServerMessage } from "../../../shared/types/websocket";
import { config } from '../config';

type MessageHandler = (data: WSServerMessage) => void;

export class WebSocketService {
  private ws: WebSocket | null = null;
  private messageHandlers: Map<string, MessageHandler> = new Map();
  private sessionId: string | null = null;
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 5;
  private connecting = false;
  private connectionTimeout: NodeJS.Timeout | null = null;
  private onOpenHandler: (() => void) | null = null;

  onOpen(handler: () => void) {
    this.onOpenHandler = handler;
  }

  setSessionId(sessionId: string) {
    this.sessionId = sessionId;
  }

  connect(sessionId?: string) {
    if (sessionId) {
      console.log('Connecting with sessionId:', sessionId);
      this.sessionId = sessionId;
    }

    // If already connected with the same sessionId, don't reconnect
    if (this.ws?.readyState === WebSocket.OPEN && this.sessionId === sessionId) {
      console.log("WebSocket already connected with correct sessionId");
      if (this.onOpenHandler) {
        this.onOpenHandler();
      }
      return;
    }

    // If connecting, wait
    if (this.connecting) {
      console.log("WebSocket connection in progress");
      return;
    }

    this.connecting = true;
    
    const wsUrl = `${window.location.protocol === "https:" ? "wss:" : "ws"}://${
      window.location.hostname
    }:${config.wsPort}/ws`;

    console.log(`Attempting to connect to WebSocket at ${wsUrl}`);
    
    if (this.ws) {
      console.log('Closing existing connection');
      this.ws.close(1000);
      this.ws = null;
    }

    this.ws = new WebSocket(wsUrl, ["story-protocol"]);

    this.ws.onopen = () => {
      console.log("WebSocket connected, readyState:", this.ws?.readyState);
      this.connecting = false;
      this.reconnectAttempts = 0;
      if (this.onOpenHandler) {
        this.onOpenHandler();
      }
    };

    this.ws.onmessage = (event) => {
      console.log('Received message:', event.data);
      try {
        const data = JSON.parse(event.data) as WSServerMessage;
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
      this.connecting = false;
      if (event.code !== 1000) {
        this.handleReconnect();
      }
    };

    this.ws.onerror = (error) => {
      console.error("WebSocket error:", error);
      this.connecting = false;
    };
  }

  initializeStory(prompt: string, generateImages: boolean) {
    if (!this.sessionId) {
      console.warn('Cannot initialize story: no sessionId');
      return;
    }
    
    const message = {
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
    
    const message = {
      type: "make_choice",
      sessionId: this.sessionId,
      payload: { optionIndex }
    };
    
    console.log('[WebSocketService] Sending choice:', message);
    this.sendMessage(message);
  }

  onMessage(type: "session_created" | "state_update" | "error", handler: MessageHandler) {
    console.log('[WebSocketService] Registering handler for:', type);
    this.messageHandlers.set(type, handler);
  }

  clearMessageHandlers() {
    this.messageHandlers.clear();
    this.onOpenHandler = null;
  }

  
  sendMessage(data: object) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      console.log('[WebSocketService] Sending message:', data);
      this.ws.send(JSON.stringify(data));
    } else {
      console.warn('[WebSocketService] Cannot send message, WebSocket not open:', {
        readyState: this.ws?.readyState,
        data
      });
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
    this.connecting = false;
    this.reconnectAttempts = 0;
  }

  exitStory() {
    const sessionId = this.sessionId;
    if (!sessionId) {
      console.warn('[WebSocketService] Cannot exit story: no sessionId');
      return;
    }
    
    const message = {
      type: "exit_story" as const,
      sessionId
    };
    
    console.log('[WebSocketService] Sending exit story message:', message);
    this.sendMessage(message);
  }
}

export const wsService = new WebSocketService();
