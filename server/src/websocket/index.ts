import { Server, Socket } from "socket.io";
import http from "http";
import { GameHandler } from "../handlers/GameHandler.js";
import { PlayerCount } from "shared/types/player.js";
import { config } from "../config/env.js";
import { connectionManager } from "../services/ConnectionManager.js";
import { GameMode } from "shared/types/story.js";

export class GameWebSocketServer {
  private io: Server;
  private clients: Map<string, Socket> = new Map();

  constructor(server: http.Server) {
    this.io = new Server(server, {
      cors: {
        origin: config.corsOrigin,
        methods: ["GET", "POST"],
      },
      path: "/socket.io",
    });

    // Set io instance in ConnectionManager
    connectionManager.setIo(this.io);

    this.setupSocketServer();
  }

  private setupSocketServer(): void {
    this.io.on("connection", (socket: Socket) => {
      console.log("[WebSocket] New connection established");

      const gameHandler = new GameHandler(socket);

      socket.on("create_session", async () => {
        const sessionId = crypto.randomUUID();
        connectionManager.createGameSession(sessionId);
        socket.emit("session_created", { sessionId });
        console.log("[WebSocket] Session created:", sessionId);
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
        }) => {
          console.log("[WebSocket] Initializing story with data:", data);
          await gameHandler.initializeStory(
            data.prompt,
            data.generateImages,
            data.playerCount as PlayerCount,
            data.maxTurns,
            data.gameMode
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

      socket.on(
        "verify_code",
        async (data: { sessionId: string; code: string }) => {
          console.log("[WebSocket] Verifying code:", {
            sessionId: data.sessionId,
            code: data.code,
          });

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
          }

          // Send response to client
          socket.emit("verify_code_response", {
            type: "verify_code_response",
            ...result,
          });
        }
      );

      socket.on("exit_story", async () => {
        await connectionManager.exitStory(socket.id);
        socket.emit("exit_story_response");
      });

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
