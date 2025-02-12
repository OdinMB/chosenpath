import { WebSocketServer, WebSocket } from "ws";
import { Server } from "http";
import type { StoryState } from "../../../shared/types/story.js";
import type { ImageGeneration } from "../../../shared/types/image.js";
import { StoryService } from "../services/StoryService.js";
import { sessionService } from "../services/SessionService.js";
import { imageService } from "../services/ImageService.js";

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
                
                // Save and broadcast updated state with beat immediately
                sessionService.updateSession(data.sessionId, stateWithBeat);
                this.broadcastStateUpdate(data.sessionId, stateWithBeat);

                // Handle image generation if needed
                await this.handleImageGeneration(data.sessionId, stateWithBeat, firstBeat.imageGeneration);
                
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

              await this.handleMakeChoice(ws, data.sessionId, data.payload.optionIndex);
              break;

            case "exit_story":
              if (!data.sessionId) {
                console.warn('[WebSocket] Missing sessionId for exit_story');
                break;
              }
              console.log('[WebSocket] Exiting story for session:', data.sessionId);
              sessionService.updateSession(data.sessionId, null);
              
              // Send confirmation back to client
              ws.send(JSON.stringify({ 
                type: "exit_story_response",
                sessionId: data.sessionId 
              }));
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

  private async handleImageGeneration(
    sessionId: string, 
    state: StoryState, 
    imageGeneration?: ImageGeneration
  ): Promise<void> {
    const lastBeat = state.beatHistory[state.beatHistory.length - 1];
    if (state.generateImages && !lastBeat.imageId && imageGeneration) {
      const image = await imageService.generateImage(imageGeneration);
      if (image) {
        // Update state with the new image
        const stateWithImage = imageService.updateStateWithImage(state, image);
        
        // Save and broadcast the state update with the new image
        sessionService.updateSession(sessionId, stateWithImage);
        this.broadcastStateUpdate(sessionId, stateWithImage);
      }
    }
  }

  async handleMakeChoice(ws: WebSocket, sessionId: string, optionIndex: number) {
    try {
      // Get current state
      const currentState = sessionService.getSession(sessionId);
      if (!currentState) {
        console.warn('No state found for session:', sessionId);
        return;
      }

      // Process the choice
      const stateAfterChoice = await this.storyService.processPlayerChoice(
        currentState,
        optionIndex
      );
      
      // Generate next beat
      const nextBeat = await this.storyService.generateNextBeat(stateAfterChoice);
      
      // Create initial state with new beat
      let updatedState = {
        ...stateAfterChoice,
        beatHistory: [...stateAfterChoice.beatHistory, nextBeat]
      };

      // Save and broadcast the initial state update immediately
      sessionService.updateSession(sessionId, updatedState);
      this.broadcastStateUpdate(sessionId, updatedState);
      
      // Handle image generation if needed
      await this.handleImageGeneration(sessionId, updatedState, nextBeat.imageGeneration);
      
      console.log('Choice processed and next beat generated for session:', sessionId);
    } catch (error) {
      console.error('Failed to process choice:', error);
      ws.send(JSON.stringify({ 
        type: "error", 
        error: "Failed to process choice" 
      }));
    }
  }

  broadcastStateUpdate(sessionId: string, state: StoryState | null) {
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
