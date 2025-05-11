import http from "http";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import { API_CONFIG, isDevelopment } from "server/config.js";
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
    // Log environment variables
    console.log("[Server] NODE_ENV:", process.env.NODE_ENV);
    console.log(
      "[Server] Environment:",
      isDevelopment ? "development" : "production"
    );
    console.log("[Server] CORS origins:", API_CONFIG.DEFAULT_CORS_ORIGIN);

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

          // Extract domain from origin
          const originDomain = origin.replace(/^https?:\/\//, "");

          // Check if the origin domain is in the allowed list
          if (API_CONFIG.DEFAULT_CORS_ORIGIN.includes(originDomain)) {
            console.log(`[CORS] Origin ${origin} allowed`);
            return callback(null, origin); // Return the full origin
          }

          console.log(
            `[CORS] Origin ${origin} rejected. Allowed origins:`,
            API_CONFIG.DEFAULT_CORS_ORIGIN
          );
          callback(new Error("Not allowed by CORS"));
        },
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        credentials: true,
        allowedHeaders: ["Content-Type", "X-CSRF-TOKEN", "X-XSRF-TOKEN"],
        exposedHeaders: ["X-CSRF-TOKEN", "X-XSRF-TOKEN"],
      })
    );

    // Add cookie parser middleware
    app.use(cookieParser());

    // Health check endpoint (before CSRF middleware)
    app.get("/health", (_, res) => {
      res.json({ status: "ok" });
    });

    // Add CSRF protection
    app.use(
      csrf({
        cookie: {
          key: "XSRF-TOKEN",
          path: "/",
          httpOnly: false,
          secure: !isDevelopment,
          sameSite: "lax", // Changed from 'none' to 'lax'
          domain: isDevelopment
            ? undefined
            : `.${API_CONFIG.DEFAULT_CORS_ORIGIN[0]}`,
        },
        value: (req) => {
          // Check for token in header first
          const token = req.headers["x-csrf-token"];
          if (token) {
            return token;
          }
          // Fall back to cookie
          return req.cookies["XSRF-TOKEN"];
        },
        ignoreMethods: ["GET", "HEAD", "OPTIONS"],
      })
    );

    // Add CSRF token to all responses
    app.use((req: Request, res: Response, next: NextFunction) => {
      // Always set a new token
      const token = req.csrfToken();
      console.log("[CSRF] Setting token:", token);
      res.cookie("XSRF-TOKEN", token, {
        secure: !isDevelopment,
        sameSite: "lax", // Changed from 'none' to 'lax'
        path: "/",
        httpOnly: false,
        domain: isDevelopment
          ? undefined
          : `.${API_CONFIG.DEFAULT_CORS_ORIGIN[0]}`,
      });
      next();
    });

    // Add error handler for CSRF errors
    app.use((err: any, req: Request, res: Response, next: NextFunction) => {
      if (err.code === "EBADCSRFTOKEN") {
        console.log("[CSRF] Token validation failed");
        console.log("[CSRF] Request headers:", req.headers);
        console.log("[CSRF] Request cookies:", req.cookies);
        console.log("[CSRF] Error details:", err);
        return res.status(403).json({
          status: "error",
          errorMessage: "Invalid CSRF token",
          details: {
            headers: req.headers,
            cookies: req.cookies,
            error: err.message,
          },
        });
      }
      next(err);
    });

    app.use(express.json());

    // Regular API routes
    app.use("", router);

    app.set("trust proxy", true);
    const server = http.createServer(app);

    // Create a single GameHandler instance to be used by the WebSocket server
    const gameHandler = new GameHandler();
    console.log("[Server] Created GameHandler instance");

    // Initialize WebSocket server with the GameHandler
    const wsServer = new GameWebSocketServer(server, gameHandler);
    console.log("[Server] Created WebSocket server with GameHandler");

    // Start HTTP server
    server.listen(API_CONFIG.DEFAULT_PORT, () => {
      console.log(
        `[Server] HTTP/WebSocket server running on port ${API_CONFIG.DEFAULT_PORT}`
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
