import http from "http";
import express from "express";
import cors from "cors";
import { GameWebSocketServer } from "./websocket/index.js";
import { config } from "./config/env.js";

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
      methods: ["GET", "POST"],
      credentials: true,
    })
  );
  app.use(express.json());

  // Health check endpoint
  app.get("/health", (_, res) => {
    res.json({ status: "ok" });
  });

  app.set("trust proxy", true);

  const server = http.createServer(app);

  // Initialize WebSocket server
  const wsServer = new GameWebSocketServer(server);

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
