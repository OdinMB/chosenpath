import { Server, Socket } from "socket.io";
import http from "http";
import { SessionService } from "../services/SessionService.js";
import { GameHandler } from "../handlers/GameHandler.js";
import { PlayerCount } from "../../../shared/types/players.js";
import { config } from "../config/env.js";
import { connectionManager } from "../services/ConnectionManager.js";
import type { PlayerSlot } from "../../../shared/types/players.js";
import type { WSClientMessage } from "../../../shared/types/websocket.js";

export class GameWebSocketServer {
  private io: Server;
  private clients: Map<string, Socket> = new Map();
  private sessionService: SessionService;

  constructor(server: http.Server) {
    this.sessionService = new SessionService();
    this.io = new Server(server, {
      cors: {
        origin: config.corsOrigin,
        methods: ["GET", "POST"],
      },
      path: "/socket.io",
    });

    this.setupSocketServer();
  }

  private setupSocketServer(): void {
    this.io.on("connection", (socket: Socket) => {
      console.log("[WebSocket] New connection established");

      const gameHandler = new GameHandler(socket);

      socket.on("create_session", async () => {
        const sessionId = this.sessionService.createSession();
        connectionManager.createGameSession(sessionId);
        socket.emit("session_created", { sessionId });
        console.log("[WebSocket] Session created:", sessionId);
      });

      socket.on("join_session", async (sessionId: string) => {
        const existingState = this.sessionService.getSession(sessionId);
        if (existingState) {
          socket.join(sessionId);
          this.clients.set(sessionId, socket);
          socket.emit("state_update", { state: existingState });
          console.log("[WebSocket] Client joined session:", sessionId);
        } else {
          console.log("[WebSocket] Session not found:", sessionId);
          socket.emit("error", "Session not found");
        }
      });

      socket.on(
        "initialize_story",
        async (data: {
          sessionId: string;
          prompt: string;
          generateImages: boolean;
          playerCount: number;
        }) => {
          console.log("[WebSocket] Initializing story with data:", data);
          await gameHandler.initializeStory(
            data.sessionId,
            data.prompt,
            data.generateImages,
            data.playerCount as PlayerCount
          );
        }
      );

      socket.on("make_choice", async (data: { optionIndex: number }) => {
        try {
          await gameHandler.makeChoice(data.optionIndex);
        } catch (error) {
          socket.emit("error", {
            error:
              error instanceof Error
                ? error.message
                : "Failed to process choice",
          });
        }
      });

      socket.on("exit_story", async (data: { sessionId: string }) => {
        await gameHandler.exitStory(data.sessionId);
      });

      socket.on(
        "verify_code",
        async (data: { sessionId: string; code: string }) => {
          console.log("[WebSocket] Verifying code:", {
            sessionId: data.sessionId,
            code: data.code,
          });

          const playerInfo = await connectionManager.getPlayerByCode(data.code);

          if (!playerInfo) {
            console.log("[WebSocket] Invalid code:", data.code);
            socket.emit("verify_code_response", {
              state: null,
              error: "Invalid code",
            });
            return;
          }

          console.log("[WebSocket] Found player info:", playerInfo);

          // Add this connection to the player's active connections
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

          // Get verification result from GameHandler
          const result = await gameHandler.verifyCode(
            data.sessionId,
            data.code
          );

          console.log("[WebSocket] Verification result:", result);

          // Send response to client
          socket.emit("verify_code_response", {
            type: "verify_code_response",
            ...result,
          });
        }
      );

      socket.on("disconnect", () => {
        connectionManager.removeSocket(socket.id);
        // Find affected game sessions and broadcast updates
        this.broadcastActivePlayersUpdatesForSocket(socket.id);
        console.log("[WebSocket] Client disconnected");
        for (const [sessionId, clientSocket] of this.clients.entries()) {
          if (clientSocket === socket) {
            this.clients.delete(sessionId);
            break;
          }
        }
      });
    });
  }

  private broadcastActivePlayersUpdate(storyId: string): void {
    const activePlayers = connectionManager.getActivePlayersInGame(storyId);
    this.io.to(storyId).emit("active_players_update", {
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
