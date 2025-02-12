import { WebSocketServer, WebSocket } from "ws";
import { Server } from "http";
import type { StoryState } from "../../../shared/types/story.js";
import { StoryService } from "../services/StoryService.js";
import { sessionService } from "../services/SessionService.js";

interface GameClient {
  ws: WebSocket;
  sessionId: string;
}

type WSMessage = {
  type: string;
  sessionId?: string;
  payload?: any;
};

export class GameWebSocketServer {
  private wss: WebSocketServer;
  private clients: Map<string, GameClient>;
  private storyService: StoryService;

  constructor(server: Server) {
    this.wss = new WebSocketServer({ 
      server,
      path: "/ws", // Explicit WebSocket path
      clientTracking: true,
      handleProtocols: () => "story-protocol"
    });
    
    this.clients = new Map();
    this.storyService = new StoryService();
    this.setupWebSocketServer();

    // Log server events for debugging
    this.wss.on("headers", (headers) => {
      console.log("WebSocket headers:", headers);
    });

    this.wss.on("error", (error) => {
      console.error("WebSocket server error:", error);
    });
  }

  private setupWebSocketServer() {
    this.wss.on("connection", (ws: WebSocket, request) => {
      console.log('[WebSocket] New connection established');
      
      ws.on("close", () => {
        console.log('[WebSocket] Connection closed');
        // Log active sessions
        console.log('[WebSocket] Active sessions:', Array.from(this.clients.keys()));
      });

      ws.on("message", async (message: string) => {
        console.log('[WebSocket] Received message:', message);
        try {
          const data: WSMessage = JSON.parse(message);
          console.log('[WebSocket] Parsed message:', data);
          
          switch (data.type) {
            case "join":
              console.log('[WebSocket] Joining session:', data.sessionId);
              if (data.sessionId) {
                const existingState = sessionService.getSession(data.sessionId);
                if (existingState) {
                  console.log('[WebSocket] Found existing state for session:', data.sessionId);
                  this.clients.set(data.sessionId, { ws, sessionId: data.sessionId });
                  this.broadcastStateUpdate(data.sessionId, existingState);
                } else {
                  console.log('[WebSocket] Session expired, creating new session');
                  // Create new session since the old one expired
                  const newSessionId = sessionService.createSession();
                  this.clients.set(newSessionId, { ws, sessionId: newSessionId });
                  ws.send(JSON.stringify({ 
                    type: "session_created", 
                    sessionId: newSessionId,
                    error: "Previous session expired" 
                  }));
                }
              }
              break;

            case "create_session":
              console.log('[WebSocket] Creating new session');
              const sessionId = sessionService.createSession();
              this.clients.set(sessionId, { ws, sessionId });
              ws.send(JSON.stringify({ type: "session_created", sessionId }));
              console.log('[WebSocket] Session created:', sessionId);
              break;

            case "initialize_story":
              console.log('Initializing story:', data);
              if (!data.sessionId || !data.payload?.prompt) {
                console.warn('Missing sessionId or prompt');
                break;
              }
              
              try {
                const initialState = await this.storyService.createInitialState(
                  data.payload.prompt,
                  data.payload.generateImages || false
                );
                
                // Save and broadcast initial state
                sessionService.updateSession(data.sessionId, initialState);
                this.broadcastStateUpdate(data.sessionId, initialState);
                
                // Generate first beat
                const firstBeat = await this.storyService.generateNextBeat(initialState);
                
                // Update state with first beat
                const stateWithBeat = {
                  ...initialState,
                  beatHistory: [firstBeat]
                };
                
                // Save and broadcast updated state
                sessionService.updateSession(data.sessionId, stateWithBeat);
                this.broadcastStateUpdate(data.sessionId, stateWithBeat);
                
                console.log('Story initialized with first beat for session:', data.sessionId);
              } catch (error) {
                console.error('Failed to initialize story:', error);
                ws.send(JSON.stringify({ 
                  type: "error", 
                  error: "Failed to initialize story" 
                }));
              }
              break;

            case "make_choice":
              console.log('Processing choice:', data);
              if (!data.sessionId || data.payload?.optionIndex === undefined) {
                console.warn('Missing sessionId or optionIndex');
                break;
              }

              try {
                // Get current state
                const currentState = sessionService.getSession(data.sessionId);
                if (!currentState) {
                  console.warn('No state found for session:', data.sessionId);
                  break;
                }

                // Process the choice
                const stateAfterChoice = await this.storyService.processPlayerChoice(
                  currentState,
                  data.payload.optionIndex
                );
                
                // Generate next beat
                const nextBeat = await this.storyService.generateNextBeat(stateAfterChoice);
                
                // Create final state with new beat
                const finalState = {
                  ...stateAfterChoice,
                  beatHistory: [...stateAfterChoice.beatHistory, nextBeat]
                };

                // Save and broadcast the updated state
                sessionService.updateSession(data.sessionId, finalState);
                this.broadcastStateUpdate(data.sessionId, finalState);
                
                console.log('Choice processed and next beat generated for session:', data.sessionId);
              } catch (error) {
                console.error('Failed to process choice:', error);
                ws.send(JSON.stringify({ 
                  type: "error", 
                  error: "Failed to process choice" 
                }));
              }
              break;

            case "exit_story":
              console.log('[WebSocket] Exiting story for session:', data.sessionId);
              sessionService.updateSession(data.sessionId, null);
              this.broadcastStateUpdate(data.sessionId, null);
              break;
          }
        } catch (error) {
          console.error('[WebSocket] Error processing message:', error);
          ws.send(JSON.stringify({ 
            type: "error", 
            error: "Failed to process message" 
          }));
        }
      });
    });
  }

  broadcastStateUpdate(sessionId: string, state: StoryState) {
    const client = this.clients.get(sessionId);
    if (!client?.ws) {
      console.warn('[WebSocket] Cannot broadcast: no client found for session:', sessionId);
      return;
    }
    console.log('[WebSocket] Broadcasting state update to session:', sessionId);
    client.ws.send(JSON.stringify({ type: "state_update", state }));
  }

  close(callback?: () => void) {
    console.log('Closing all WebSocket connections...');
    
    // Close all client connections
    for (const [sessionId, client] of this.clients) {
      try {
        client.ws.close(1000, 'Server shutting down');
      } catch (error) {
        console.error(`Error closing client connection ${sessionId}:`, error);
      }
    }
    
    // Clear clients map
    this.clients.clear();
    
    // Close the WebSocket server
    this.wss.close(() => {
      console.log('WebSocket server closed successfully');
      if (callback) callback();
    });
  }
}
