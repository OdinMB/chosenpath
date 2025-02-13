import { Server, Socket } from "socket.io";
import http from "http";
import { SessionService } from "../services/SessionService.js";
import { GameHandler } from "../handlers/GameHandler.js";
import { PlayerCount } from "../../../shared/types/players.js";
import { config } from "../config/env.js";

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
      path: "/socket.io"
    });

    this.setupSocketServer();
  }

  private setupSocketServer(): void {
    this.io.on("connection", (socket: Socket) => {
      console.log('[WebSocket] New connection established');

      const gameHandler = new GameHandler(socket);

      socket.on("create_session", async () => {
        const sessionId = this.sessionService.createSession();
        this.clients.set(sessionId, socket);
        socket.join(sessionId);
        socket.emit("session_created", { sessionId });
        console.log('[WebSocket] Session created:', sessionId);
      });

      socket.on("join_session", async (sessionId: string) => {
        const existingState = this.sessionService.getSession(sessionId);
        if (existingState) {
          socket.join(sessionId);
          this.clients.set(sessionId, socket);
          socket.emit("state_update", { state: existingState });
          console.log('[WebSocket] Client joined session:', sessionId);
        } else {
          socket.emit("error", { error: "Session not found" });
        }
      });

      socket.on("initialize_story", async (data: { 
        sessionId: string; 
        prompt: string; 
        generateImages: boolean;
        playerCount: number;
      }) => {
        console.log('[WebSocket] Initializing story with data:', data);
        await gameHandler.initializeStory(
          data.sessionId, 
          data.prompt, 
          data.generateImages,
          data.playerCount as PlayerCount
        );
      });

      socket.on("make_choice", async (data: { sessionId: string; optionIndex: number }) => {
        await gameHandler.makeChoice(data.sessionId, data.optionIndex);
      });

      socket.on("exit_story", async (data: { sessionId: string }) => {
        await gameHandler.exitStory(data.sessionId);
      });

      socket.on("disconnect", () => {
        console.log('[WebSocket] Client disconnected');
        for (const [sessionId, clientSocket] of this.clients.entries()) {
          if (clientSocket === socket) {
            this.clients.delete(sessionId);
            break;
          }
        }
      });
    });
  }

  close(callback?: () => void): void {
    this.io.close(callback);
  }
}
