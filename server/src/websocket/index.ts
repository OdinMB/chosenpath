import { WebSocketServer, WebSocket } from "ws";
import { Server } from "http";
import type { StoryState } from "../../../shared/types/story.js";

interface GameClient {
  ws: WebSocket;
  sessionId: string;
}

export class GameWebSocketServer {
  private wss: WebSocketServer;
  private clients: Map<string, GameClient>;

  constructor(server: Server) {
    this.wss = new WebSocketServer({ server });
    this.clients = new Map();
    this.setupWebSocketServer();
  }

  private setupWebSocketServer() {
    this.wss.on("connection", (ws: WebSocket) => {
      console.log("New client connected");

      ws.on("message", (message: string) => {
        try {
          const data = JSON.parse(message);
          if (data.type === "join" && data.sessionId) {
            this.clients.set(data.sessionId, { ws, sessionId: data.sessionId });
            console.log(`Client joined session: ${data.sessionId}`);
          }
        } catch (error) {
          console.error("Error processing WebSocket message:", error);
        }
      });

      ws.on("close", () => {
        for (const [sessionId, client] of this.clients.entries()) {
          if (client.ws === ws) {
            this.clients.delete(sessionId);
            console.log(`Client left session: ${sessionId}`);
            break;
          }
        }
      });
    });
  }

  broadcastStateUpdate(sessionId: string, state: StoryState) {
    const client = this.clients.get(sessionId);
    if (client && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(
        JSON.stringify({
          type: "stateUpdate",
          state,
        })
      );
    }
  }
}
