import http from "http";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import { config } from "./config.js";
import { router } from "./routes/index.js";
import { GameWebSocketServer } from "./routes/websocket.js";
import { GameHandler } from "game/GameHandler.js";
import { initializeDatabase, closeDatabase } from "./shared/db.js";
import { cleanupExpiredSessions } from "./users/userService.js";
import csrf from "csurf";
import cookieParser from "cookie-parser";

// Extend Express Request type to include csrfToken
declare global {
  namespace Express {
    interface Request {
      csrfToken(): string;
    }
  }
}

async function startServer() {
  try {
    // Initialize database
    await initializeDatabase();
    console.log("[Server] Database initialized");

    // Schedule periodic cleanup of expired sessions (every hour)
    setInterval(cleanupExpiredSessions, 60 * 60 * 1000);

    const app = express();

    // Request logging middleware for debugging
    app.use((req, res, next) => {
      console.log(`[Server] ${req.method} ${req.url}`);
      next();
    });

    // Configure middleware with proper CORS for direct API access
    app.use(
      cors({
        origin: (origin, callback) => {
          // Allow requests with no origin (like mobile apps or curl requests)
          if (!origin) return callback(null, true);

          // Check if the origin is in the allowed list
          if (config.corsOrigins.indexOf(origin) !== -1) {
            return callback(null, true);
          }

          console.log(`[CORS] Origin ${origin} rejected`);
          callback(new Error("Not allowed by CORS"));
        },
        methods: ["GET", "POST", "PUT", "DELETE"],
        credentials: true,
      })
    );

    // Add cookie parser middleware
    app.use(cookieParser());

    // Add CSRF protection
    app.use(csrf({ cookie: true }));

    // Add CSRF token to all responses
    app.use((req: Request, res: Response, next: NextFunction) => {
      res.cookie("XSRF-TOKEN", req.csrfToken(), {
        secure: process.env.NODE_ENV === "production",
        sameSite: "none",
        path: "/",
      });
      next();
    });

    app.use(express.json());

    // Regular API routes
    app.use("", router);

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
        server.close(async () => {
          await closeDatabase();
          console.log("[Server] Server shut down complete");
          process.exit(0);
        });
      });
    });
  } catch (error) {
    console.error("[Server] Startup error:", error);
    process.exit(1);
  }
}

startServer().catch((error) => {
  console.error("[Server] Failed to start:", error);
  process.exit(1);
});
