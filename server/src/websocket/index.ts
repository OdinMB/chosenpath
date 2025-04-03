import { Server, Socket } from "socket.io";
import http from "http";
import { GameHandler } from "../handlers/GameHandler.js";
import {
  GameMode,
  PlayerCount,
  ResponseStatus,
  StateUpdateNotification,
} from "shared/types/index.js";
import { config } from "../config/env.js";
import { connectionManager } from "../services/ConnectionManager.js";
import { RateLimitedAction, SOCKET_CONFIG } from "shared/config.js";
import {
  checkRateLimit,
  incrementRateLimit,
} from "../middleware/rateLimiter.js";

export class GameWebSocketServer {
  private io: Server;
  private clients: Map<string, Socket> = new Map();

  constructor(server: http.Server) {
    this.io = new Server(server, {
      cors: {
        origin: (origin, callback) => {
          // Allow requests with no origin
          if (!origin) return callback(null, true);

          // Check if the origin is in the allowed list
          if (config.corsOrigins.indexOf(origin) !== -1) {
            return callback(null, true);
          }

          callback(new Error("Not allowed by CORS"));
        },
        methods: ["GET", "POST"],
      },
      path: "/socket.io",
      // Add Socket.IO keep-alive configurations
      pingInterval: SOCKET_CONFIG.SERVER.pingInterval,
      pingTimeout: SOCKET_CONFIG.SERVER.pingTimeout,
    });

    // Set io instance in ConnectionManager
    connectionManager.setIo(this.io);

    this.setupSocketServer();
  }

  /**
   * Checks if a request is rate limited and sends a response if it is
   * @param socket The client socket
   * @param action The action being rate limited
   * @param requestId Optional request ID to include in response
   * @returns True if the request is rate limited, false otherwise
   */
  private checkAndHandleRateLimit(
    socket: Socket,
    action: RateLimitedAction,
    requestId?: string
  ): boolean {
    // Get client IP address
    let ip = socket.handshake.address;
    if (!ip) {
      console.warn("[WebSocket] Missing IP address for connection");
      ip = "unknown";
    }

    // Check if rate limited
    const limitStatus = checkRateLimit(ip, action);

    if (limitStatus.isLimited) {
      console.log(`[WebSocket] Rate limited for ${action}:`, {
        ip,
        timeRemaining: limitStatus.timeRemaining,
        requestsRemaining: limitStatus.requestsRemaining,
      });

      // Send rate limit response
      socket.emit("response", {
        type: `${action}_response`,
        status: ResponseStatus.RATE_LIMITED,
        requestId: requestId || crypto.randomUUID(),
        timestamp: Date.now(),
        rateLimit: {
          action,
          timeRemaining: limitStatus.timeRemaining,
          maxRequests: limitStatus.maxRequests,
          windowMs: limitStatus.windowMs,
          requestsRemaining: limitStatus.requestsRemaining,
        },
      });

      return true;
    }

    // Increment counter for this action
    incrementRateLimit(ip, action);
    return false;
  }

  private setupSocketServer(): void {
    this.io.on("connection", (socket: Socket) => {
      console.log(`[WebSocket] New connection established: ${socket.id}`);
      this.clients.set(socket.id, socket);

      // Add disconnect handler with detailed logging
      socket.on("disconnect", (reason) => {
        try {
          console.log(
            `[WebSocket] Client disconnected: ${socket.id}, reason: ${reason}`
          );
          this.clients.delete(socket.id);

          // Remove socket from connection manager
          connectionManager.removeSocket(socket.id);

          // Find affected game sessions and broadcast updates
          this.broadcastActivePlayersUpdatesForSocket(socket.id);

          // Log the number of remaining clients
          console.log(
            `[WebSocket] Remaining connected clients: ${this.clients.size}`
          );
        } catch (error) {
          console.error(
            `[WebSocket] Error handling disconnect for ${socket.id}:`,
            error
          );
        }
      });

      // Handle heartbeat messages
      socket.on("heartbeat", (data) => {
        console.log(`[WebSocket] Heartbeat from client: ${socket.id}`);

        // Echo back a heartbeat response to confirm the connection is alive
        socket.emit("heartbeat", { timestamp: Date.now() });

        // If this socket is associated with a session, update its last active timestamp
        if (data && data.sessionId) {
          connectionManager.updateLastActive(data.sessionId, socket.id);
        }
      });

      const gameHandler = new GameHandler(socket);

      // Set up global error handler for socket errors
      socket.on("error", (error) => {
        console.error("[WebSocket] Socket error:", error);
        socket.emit("error", {
          error: "Connection error",
          details: error instanceof Error ? error.message : String(error),
        });
      });

      socket.on("create_session", async () => {
        try {
          const sessionId = crypto.randomUUID();
          connectionManager.createGameSession(sessionId);
          socket.emit("response", {
            type: "create_session_response",
            status: ResponseStatus.SUCCESS,
            requestId: crypto.randomUUID(),
            timestamp: Date.now(),
            data: { sessionId },
          });
          console.log("[WebSocket] Session created:", sessionId);
        } catch (error) {
          console.error("[WebSocket] Error creating session:", error);
          socket.emit("response", {
            type: "create_session_response",
            status: ResponseStatus.ERROR,
            requestId: crypto.randomUUID(),
            timestamp: Date.now(),
            errorMessage: "Failed to create session",
          });
        }
      });

      socket.on(
        "initialize_story",
        async (data: {
          sessionId: string;
          prompt: string;
          generateImages: boolean;
          playerCount: number;
          maxTurns: number;
          gameMode: GameMode;
          requestId?: string;
        }) => {
          try {
            console.log("[WebSocket] Initialize story request:", data);

            // Check rate limiting
            if (
              this.checkAndHandleRateLimit(
                socket,
                "initialize_story",
                data.requestId
              )
            ) {
              return;
            }

            // Process the request
            await gameHandler.initializeStory(
              data.prompt,
              data.generateImages,
              data.playerCount as PlayerCount,
              data.maxTurns,
              data.gameMode
            );
            // Send immediate success response that the request was accepted
            socket.emit("response", {
              type: "initialize_story_response",
              status: ResponseStatus.SUCCESS,
              requestId: data.requestId || crypto.randomUUID(),
              timestamp: Date.now(),
              data: { message: "Story initialization queued" },
            });
          } catch (error) {
            console.error("[WebSocket] Error initializing story:", error);
            socket.emit("response", {
              type: "initialize_story_response",
              status: ResponseStatus.ERROR,
              requestId: data.requestId || crypto.randomUUID(),
              timestamp: Date.now(),
              errorMessage:
                error instanceof Error
                  ? error.message
                  : "Failed to initialize story",
            });
          }
        }
      );

      socket.on(
        "make_choice",
        async (data: { optionIndex: number; requestId?: string }) => {
          try {
            // Check rate limiting
            if (
              this.checkAndHandleRateLimit(
                socket,
                "make_choice",
                data.requestId
              )
            ) {
              return;
            }

            // Process the request
            await gameHandler.makeChoice(data.optionIndex);
            // Send immediate success response that the request was accepted
            socket.emit("response", {
              type: "make_choice_response",
              status: ResponseStatus.SUCCESS,
              requestId: data.requestId || crypto.randomUUID(),
              timestamp: Date.now(),
              data: { optionIndex: data.optionIndex },
            });
          } catch (error) {
            console.error("[WebSocket] Error making choice:", error);
            socket.emit("response", {
              type: "make_choice_response",
              status: ResponseStatus.ERROR,
              requestId: data.requestId || crypto.randomUUID(),
              timestamp: Date.now(),
              errorMessage:
                error instanceof Error
                  ? error.message
                  : "Failed to make choice",
            });
          }
        }
      );

      socket.on(
        "select_character",
        async (data: {
          identityIndex: number;
          backgroundIndex: number;
          requestId?: string;
        }) => {
          try {
            // Check rate limiting
            if (
              this.checkAndHandleRateLimit(
                socket,
                "make_choice",
                data.requestId
              )
            ) {
              return;
            }

            // Process the request
            await gameHandler.selectCharacter(
              data.identityIndex,
              data.backgroundIndex
            );
            // Send immediate success response that the request was accepted
            socket.emit("response", {
              type: "select_character_response",
              status: ResponseStatus.SUCCESS,
              requestId: data.requestId || crypto.randomUUID(),
              timestamp: Date.now(),
              data: {
                identityIndex: data.identityIndex,
                backgroundIndex: data.backgroundIndex,
              },
            });
          } catch (error) {
            console.error("[WebSocket] Error selecting character:", error);
            socket.emit("response", {
              type: "select_character_response",
              status: ResponseStatus.ERROR,
              requestId: data.requestId || crypto.randomUUID(),
              timestamp: Date.now(),
              errorMessage:
                error instanceof Error
                  ? error.message
                  : "Failed to select character",
            });
          }
        }
      );

      socket.on(
        "verify_code",
        async (data: {
          sessionId: string;
          code: string;
          requestId?: string;
        }) => {
          try {
            console.log("[WebSocket] Verifying code:", {
              sessionId: data.sessionId,
              code: data.code,
            });

            // Check rate limiting
            if (
              this.checkAndHandleRateLimit(
                socket,
                "verify_code",
                data.requestId
              )
            ) {
              return;
            }

            // Get verification result from ConnectionManager
            const result = await connectionManager.verifyCode(data.code);

            if (result.state) {
              // Add this connection to the player's active connections
              const playerInfo = await connectionManager.getPlayerByCode(
                data.code
              );
              if (playerInfo) {
                connectionManager.addPlayer(
                  playerInfo.storyId,
                  playerInfo.playerSlot,
                  data.code,
                  socket
                );

                // Join the socket to the game's room
                socket.join(playerInfo.storyId);

                // Notify all clients in the game about active players
                this.broadcastActivePlayersUpdate(playerInfo.storyId);
              }

              // Send success response
              socket.emit("response", {
                type: "verify_code_response",
                status: ResponseStatus.SUCCESS,
                requestId: data.requestId || crypto.randomUUID(),
                timestamp: Date.now(),
                data: { state: result.state },
              });
            } else {
              // Send error response
              socket.emit("response", {
                type: "verify_code_response",
                status: ResponseStatus.ERROR,
                requestId: data.requestId || crypto.randomUUID(),
                timestamp: Date.now(),
                errorMessage: "Invalid code",
              });
            }
          } catch (error) {
            console.error("[WebSocket] Error verifying code:", error);
            socket.emit("response", {
              type: "verify_code_response",
              status: ResponseStatus.ERROR,
              requestId: data.requestId || crypto.randomUUID(),
              timestamp: Date.now(),
              errorMessage:
                error instanceof Error
                  ? error.message
                  : "Failed to verify code",
            });
          }
        }
      );

      socket.on("exit_story", async (data: { requestId?: string }) => {
        try {
          await connectionManager.exitStory(socket.id);
          socket.emit("response", {
            type: "exit_story_response",
            status: ResponseStatus.SUCCESS,
            requestId: data.requestId || crypto.randomUUID(),
            timestamp: Date.now(),
            data: {},
          });
        } catch (error) {
          console.error("[WebSocket] Error exiting story:", error);
          socket.emit("response", {
            type: "exit_story_response",
            status: ResponseStatus.ERROR,
            requestId: data.requestId || crypto.randomUUID(),
            timestamp: Date.now(),
            errorMessage:
              error instanceof Error ? error.message : "Failed to exit story",
          });
        }
      });
    });
  }

  // Format and send the state update to clients
  public sendStateUpdate(storyId: string, state: any, trigger: string): void {
    this.io.to(storyId).emit("state_update_notification", {
      state,
      trigger,
    } as StateUpdateNotification);
  }

  // Send story codes to clients
  public sendStoryCodes(storyId: string, codes: Record<string, string>): void {
    this.io.to(storyId).emit("story_codes_notification", {
      gameId: storyId,
      codes,
    });
  }

  private broadcastActivePlayersUpdate(storyId: string): void {
    const activePlayers = connectionManager.getActivePlayersInGame(storyId);
    this.io.to(storyId).emit("active_players_notification", {
      gameId: storyId,
      activePlayers: activePlayers.map((player) => ({
        playerSlot: player.playerSlot,
        isConnected: player.isConnected,
        lastActive: player.lastActive,
      })),
    });
  }

  private broadcastActivePlayersUpdatesForSocket(socketId: string): void {
    // Get all game sessions this socket was part of
    const affectedSessions = Array.from(
      this.io.sockets.adapter.sids.get(socketId) || []
    ).filter((room) => room !== socketId); // Filter out socket's default room

    // Broadcast updates to each affected game session
    affectedSessions.forEach((storyId) => {
      this.broadcastActivePlayersUpdate(storyId);
    });
  }

  // Helper method to broadcast state updates to all players in a game
  public broadcastToGame(storyId: string, event: string, data: any): void {
    this.io.to(storyId).emit(event, data);
  }

  close(callback?: () => void): void {
    this.io.close(callback);
  }
}
