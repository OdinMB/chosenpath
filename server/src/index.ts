import "module-alias/register.js";

import http from "http";
import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { Router } from "./routes.js";
import { GameWebSocketServer } from "@common/websocket.js";
import { GameHandler } from "@game/GameHandler.js";

async function startServer() {
  const app = express();

  // Configure middleware
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);

        // Check if the origin is in the allowed list
        if (config.corsOrigins.indexOf(origin) !== -1) {
          return callback(null, true);
        }

        callback(new Error("Not allowed by CORS"));
      },
      methods: ["GET", "POST", "PUT", "DELETE"],
      credentials: true,
    })
  );
  app.use(express.json());

  // Routes
  app.use("", Router);

  // Health check endpoint
  app.get("/health", (_, res) => {
    res.json({ status: "ok" });
  });

  app.set("trust proxy", true);
  const server = http.createServer(app);

  // Create a single GameHandler instance to be used by the WebSocket server
  const gameHandler = new GameHandler();
  console.log("[Server] Created GameHandler instance");

  // Initialize WebSocket server with the GameHandler
  const wsServer = new GameWebSocketServer(server, gameHandler);
  console.log("[Server] Created WebSocket server with GameHandler");

  // Start HTTP server
  server.listen(config.port, () => {
    console.log(
      `[Server] HTTP/WebSocket server running on port ${config.port}`
    );
  });

  // Graceful shutdown
  process.on("SIGTERM", () => {
    console.log("[Server] SIGTERM received. Shutting down gracefully...");
    wsServer.close(() => {
      server.close(() => {
        console.log("[Server] Server shut down complete");
        process.exit(0);
      });
    });
  });
}

startServer().catch((error) => {
  console.error("[Server] Failed to start:", error);
  process.exit(1);
});
