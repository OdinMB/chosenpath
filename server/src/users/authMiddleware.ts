import { Request, Response, NextFunction } from "express";
import { verifyToken } from "./userService.js";
import { Logger } from "../shared/logger.js";
import { PublicUser } from "core/types/user.js";

// Extend Express Request to include user property
declare global {
  namespace Express {
    interface Request {
      user?: PublicUser;
      token?: string;
    }
  }
}

/**
 * Authentication middleware to protect routes
 *
 * Usage:
 * - For required auth: app.use('/protected-route', authenticate())
 * - For optional auth: app.use('/public-route', authenticate({ required: false }))
 */
export function authenticate(
  options: { required?: boolean } = { required: true }
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    const token =
      authHeader && authHeader.startsWith("Bearer ")
        ? authHeader.substring(7) // Remove 'Bearer ' prefix
        : null;

    if (!token) {
      if (options.required) {
        Logger.Route.warn(`Authentication failed: No token provided`);
        return res.status(401).json({
          error: "Authentication required",
          requestId: req.body?.requestId || "unknown",
        });
      }
      return next(); // Continue without authentication for optional routes
    }

    try {
      const user = await verifyToken(token);

      if (!user) {
        if (options.required) {
          Logger.Route.warn(`Authentication failed: Invalid token`);
          return res.status(401).json({
            error: "Invalid or expired token",
            requestId: req.body?.requestId || "unknown",
          });
        }
        return next(); // Continue without authentication for optional routes
      }

      // Add user and token to request object
      req.user = user;
      req.token = token;

      next();
    } catch (error) {
      Logger.Route.error(`Authentication error`, error);

      if (options.required) {
        return res.status(500).json({
          error: "Authentication failed",
          requestId: req.body?.requestId || "unknown",
        });
      }

      next(); // Continue without authentication for optional routes
    }
  };
}
