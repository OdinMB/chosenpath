import { Server, Socket } from "socket.io";
import http from "http";
import { GameHandler, TURN_FAILED_LINE } from "game/GameHandler.js";
import {
  ResponseStatus,
  StateUpdateNotification,
  VerifyCodeResponse,
  ErrorResponse,
  ClientStoryState,
  RateLimitInfo,
} from "core/types/index.js";
import { connectionManager } from "./ConnectionManager.js";
import {
  RateLimitedAction,
  SOCKET_CONFIG,
  GAME_SESSION_CONFIG,
} from "core/config.js";
import {
  addressKey,
  claimRateLimit,
  limitFailures,
} from "shared/rateLimiter.js";
import { choiceLimitKey } from "shared/limitPolicy.js";
import { socketAddress } from "shared/clientAddress.js";
import { storyOrigin } from "server/stories/storyOrigins.js";
import { Logger } from "shared/logger.js";
import { API_CONFIG } from "../config.js";

export class GameWebSocketServer {
  private io: Server;
  private clients: Map<string, Socket> = new Map();
  private clientLastActivity: Map<string, number> = new Map();
  private gameHandler: GameHandler;
  private socketCleanupInterval: NodeJS.Timeout | null = null;
  private sessionCleanupInterval: NodeJS.Timeout | null = null;

  constructor(server: http.Server, gameHandler: GameHandler) {
    this.io = new Server(server, {
      cors: {
        origin: (origin, callback) => {
          // Allow requests with no origin
          if (!origin) return callback(null, true);

          // Extract domain from origin
          const originDomain = origin.replace(/^https?:\/\//, "");

          // Check if the origin domain is in the allowed list
          if (API_CONFIG.DEFAULT_CORS_ORIGIN.includes(originDomain)) {
            return callback(null, true); // Allow if origin is in the list
          }

          callback(new Error("Not allowed by CORS"));
        },
        methods: ["GET", "POST"], // WebSocket typically uses GET for handshake, POST for some upgrades
        credentials: true, // Important if you are dealing with cookies/auth
      },
      path: "/socket.io",
      // Add Socket.IO keep-alive configurations
      pingInterval: SOCKET_CONFIG.SERVER.pingInterval,
      pingTimeout: SOCKET_CONFIG.SERVER.pingTimeout,
    });

    // Set the injected GameHandler
    this.gameHandler = gameHandler;

    // Set io instance in ConnectionManager
    connectionManager.setIo(this.io);

    this.setupSocketServer();
    this.setupCleanupIntervals();
  }

  /**
   * Setup separate intervals for socket and session cleanup
   */
  private setupCleanupIntervals(): void {
    // Setup socket cleanup interval
    this.socketCleanupInterval = setInterval(() => {
      this.cleanupIdleSocketConnections();
    }, SOCKET_CONFIG.STALE_CONNECTION_CLEANUP_INTERVAL_MS);

    // Setup game session cleanup interval
    this.sessionCleanupInterval = setInterval(() => {
      connectionManager.cleanupInactiveSessions();
    }, GAME_SESSION_CONFIG.INACTIVE_SESSION_CLEANUP_INTERVAL_MS);
  }

  /**
   * Clean up socket connections that have been inactive for too long
   */
  private cleanupIdleSocketConnections(): void {
    const now = Date.now();
    const threshold = SOCKET_CONFIG.STALE_CONNECTION_THRESHOLD_MS;
    let disconnectedCount = 0;

    Logger.Websocket.log("[WebSocket] Checking for idle socket connections", {
      totalSockets: this.clients.size,
      inactivityThresholdMin: Math.round(threshold / 1000 / 60),
    });

    for (const [socketId, socket] of this.clients.entries()) {
      // Get last activity time (or connection time if no activity)
      const lastActivity = this.clientLastActivity.get(socketId) || 0;
      const idleTime = now - lastActivity;

      // If socket has been idle too long, disconnect it
      if (idleTime > threshold) {
        // Ensure the socket is properly removed from ConnectionManager
        connectionManager.removeSocket(socketId);

        // Disconnect and clean up local tracking
        socket.disconnect(true);
        this.clients.delete(socketId);
        this.clientLastActivity.delete(socketId);
        disconnectedCount++;
      }
    }

    Logger.Websocket.log("[WebSocket] Idle socket cleanup complete", {
      disconnectedCount,
      remainingSockets: this.clients.size,
    });
  }

  /** Tells the client its request was rate limited, under the action's response type. */
  private emitRateLimited(
    socket: Socket,
    action: RateLimitedAction,
    rateLimit: RateLimitInfo,
    requestId?: string
  ): void {
    Logger.Websocket.log(`[WebSocket] Rate limited for ${action}:`, {
      socketId: socket.id,
      timeRemaining: rateLimit.timeRemaining,
    });
    socket.emit("response", {
      type: `${action}_response`,
      status: ResponseStatus.RATE_LIMITED,
      requestId: requestId || crypto.randomUUID(),
      timestamp: Date.now(),
      rateLimit: {
        action,
        timeRemaining: rateLimit.timeRemaining,
        maxRequests: rateLimit.maxRequests,
        windowMs: rateLimit.windowMs,
        requestsRemaining: rateLimit.requestsRemaining,
      },
    });
  }

  /**
   * Counts the request against the key's limit for the action, or, when the
   * key is limited, answers the client instead.
   * @returns True if the request is rate limited, false otherwise
   */
  private checkAndHandleRateLimit(
    socket: Socket,
    key: string,
    action: RateLimitedAction,
    requestId?: string
  ): boolean {
    const claim = claimRateLimit(key, action);
    if (!claim.claimed) {
      this.emitRateLimited(socket, action, claim.rateLimit, requestId);
      return true;
    }
    return false;
  }

  /**
   * The key a choice, character pick or turn retry counts against: the seat
   * in a story an account started, else the address (limitPolicy.ts). The
   * address too when the story's origin can't be read. The origin is
   * remembered per story (storyOrigins.ts), so a choice queries the database
   * at most once per story every few minutes.
   */
  private async choiceKey(socket: Socket): Promise<string> {
    const address = socketAddress(socket);
    const seat = connectionManager.getPlayerBySocket(socket.id);
    if (!seat) {
      return choiceLimitKey(undefined, undefined, address);
    }
    try {
      const origin = await storyOrigin(seat.storyId);
      return choiceLimitKey(origin, seat, address);
    } catch (error) {
      Logger.Websocket.error(
        "[WebSocket] Could not read the story's origin; counting the choice by address",
        error
      );
      return choiceLimitKey(undefined, seat, address);
    }
  }

  private setupSocketServer(): void {
    this.io.on("connection", (socket: Socket) => {
      console.log(`[WebSocket] New connection established: ${socket.id}`);
      this.clients.set(socket.id, socket);
      // Record connection time as last activity
      this.clientLastActivity.set(socket.id, Date.now());

      // Register the socket with the GameHandler
      this.gameHandler.registerSocket(socket);

      // Add disconnect handler with detailed logging
      socket.on("disconnect", (reason) => {
        try {
          console.log(
            `[WebSocket] Client disconnected: ${socket.id}, reason: ${reason}`
          );
          this.clients.delete(socket.id);
          this.clientLastActivity.delete(socket.id);

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

      // Update last activity time on any socket event
      const updateActivity = () => {
        this.clientLastActivity.set(socket.id, Date.now());
      };

      // Track activity on all relevant events
      socket.onAny(updateActivity);

      // Set up global error handler for socket errors
      socket.on("error", (error) => {
        Logger.Websocket.error("[WebSocket] Socket error:", error);
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
        } catch (error) {
          Logger.Websocket.error("[WebSocket] Error creating session:", error);
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
        "select_character",
        async (data: {
          identityIndex: number;
          backgroundIndex: number;
          requestId?: string;
        }) => {
          try {
            console.log("[WebSocket] Select character request:", data);

            // Check rate limiting
            if (
              this.checkAndHandleRateLimit(
                socket,
                await this.choiceKey(socket),
                "make_choice",
                data.requestId
              )
            ) {
              return;
            }

            // The GameHandler answers once it has queued the selection; this returns when
            // the queue has recorded it, and needs no second answer (the client never got one)
            await this.gameHandler.selectCharacter(
              socket,
              data.identityIndex,
              data.backgroundIndex
            );
          } catch (error) {
            Logger.Websocket.error(
              "[WebSocket] Error selecting character:",
              error
            );
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
          userId?: string;
          requestId?: string;
        }) => {
          try {
            console.log("[WebSocket] Verifying code:", {
              sessionId: data.sessionId,
              code: data.code,
              userId: data.userId,
            });

            // Only a code that names no story counts against the limit
            const outcome = await limitFailures(
              addressKey(socketAddress(socket)),
              "verify_code",
              async () => {
                const verified = await connectionManager.verifyCode(data.code);
                return { succeeded: verified.state !== null, value: verified };
              }
            );
            if (outcome.limited) {
              this.emitRateLimited(
                socket,
                "verify_code",
                outcome.rateLimit,
                data.requestId
              );
              return;
            }
            const result = outcome.value;

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
                  socket,
                  data.userId
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
                data: { code: data.code, state: result.state },
              } as VerifyCodeResponse);
              Logger.Websocket.log(
                "[WebSocket] verify_code_response with code:",
                data.code
              );

              // Arriving at a story stuck on its turn: told as the players were when it failed
              if (playerInfo) {
                await this.gameHandler.tellIfTurnStuck(
                  socket,
                  playerInfo.storyId
                );
              }
            } else {
              // Send error response
              Logger.Websocket.error(
                "[WebSocket] verify_code_response with error:",
                "Invalid code"
              );
              socket.emit("response", {
                type: "verify_code_response",
                status: ResponseStatus.ERROR,
                requestId: data.requestId || crypto.randomUUID(),
                timestamp: Date.now(),
                errorMessage: "Invalid code",
              } as ErrorResponse);
            }
          } catch (error) {
            Logger.Websocket.error("[WebSocket] Error verifying code:", error);
            socket.emit("response", {
              type: "verify_code_response",
              status: ResponseStatus.ERROR,
              requestId: data.requestId || crypto.randomUUID(),
              timestamp: Date.now(),
              errorMessage:
                error instanceof Error
                  ? error.message
                  : "Failed to verify code",
            } as ErrorResponse);
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
          Logger.Websocket.log("[WebSocket] exit_story_response");
        } catch (error) {
          Logger.Websocket.error("[WebSocket] Error exiting story:", error);
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

      // Ensure make_choice handler is present
      socket.on(
        "make_choice",
        async (data: { optionIndex: number; requestId?: string }) => {
          try {
            console.log("[WebSocket] Make choice request:", data);

            if (
              this.checkAndHandleRateLimit(
                socket,
                await this.choiceKey(socket),
                "make_choice",
                data.requestId
              )
            ) {
              return;
            }

            // As for select_character: answered once queued, returns once recorded
            await this.gameHandler.makeChoice(socket, data.optionIndex);
          } catch (error) {
            Logger.Websocket.error("[WebSocket] Error making choice:", error);
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

      // A player still on a story's page whose connection came back (GameHandler.rejoinGame);
      // it looks up a player's code, so a code that names no story counts against verify_code's limit
      socket.on(
        "rejoin_session",
        async (data: { playerCode?: string | null; requestId?: string } = {}) => {
          try {
            const outcome = await limitFailures(
              addressKey(socketAddress(socket)),
              "verify_code",
              async () => {
                const rejoined = await this.gameHandler.rejoinGame(
                  socket,
                  data.playerCode
                );
                return {
                  succeeded: !data.playerCode || rejoined !== null,
                  value: rejoined,
                };
              }
            );
            if (outcome.limited) {
              this.emitRateLimited(
                socket,
                "verify_code",
                outcome.rateLimit,
                data.requestId
              );
              return;
            }
            const gameId = outcome.value;
            if (gameId) {
              this.broadcastActivePlayersUpdate(gameId);
            }
            socket.emit("response", {
              type: "rejoin_session_response",
              status: ResponseStatus.SUCCESS,
              requestId: data.requestId || crypto.randomUUID(),
              timestamp: Date.now(),
              data: { rejoined: gameId !== null },
            });
          } catch (error) {
            Logger.Websocket.error("[WebSocket] Error rejoining a game:", error);
            socket.emit("response", {
              type: "rejoin_session_response",
              status: ResponseStatus.ERROR,
              requestId: data.requestId || crypto.randomUUID(),
              timestamp: Date.now(),
              errorMessage: "Could not reconnect to the story. Please reload the page.",
            });
          }
        }
      );

      // A player's "Try again" after a turn failed (GameHandler.retryTurn); it costs a turn's calls, so it counts as a choice
      socket.on("retry_turn", async (data: { requestId?: string } = {}) => {
        try {
          if (
            this.checkAndHandleRateLimit(
              socket,
              await this.choiceKey(socket),
              "make_choice",
              data.requestId
            )
          ) {
            return;
          }

          const queued = await this.gameHandler.retryTurn(socket);
          socket.emit("response", {
            type: "retry_turn_response",
            status: ResponseStatus.SUCCESS,
            requestId: data.requestId || crypto.randomUUID(),
            timestamp: Date.now(),
            data: { queued },
          });
        } catch (error) {
          Logger.Websocket.error("[WebSocket] Error retrying turn:", error);
          socket.emit("response", {
            type: "retry_turn_response",
            status: ResponseStatus.ERROR,
            requestId: data.requestId || crypto.randomUUID(),
            timestamp: Date.now(),
            errorMessage: TURN_FAILED_LINE,
          });
        }
      });
    });
  }

  // Format and send the state update to clients
  public sendStateUpdate(storyId: string, state: ClientStoryState, trigger: string): void {
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
  public broadcastToGame(storyId: string, event: string, data: unknown): void {
    this.io.to(storyId).emit(event, data);
  }

  close(callback?: () => void): void {
    // Clean up GameHandler before closing
    this.gameHandler.dispose();

    // Clear all intervals
    if (this.socketCleanupInterval) {
      clearInterval(this.socketCleanupInterval);
      this.socketCleanupInterval = null;
    }

    if (this.sessionCleanupInterval) {
      clearInterval(this.sessionCleanupInterval);
      this.sessionCleanupInterval = null;
    }

    // Clean up client activity tracking
    this.clientLastActivity.clear();

    this.io.close(callback);
  }
}
