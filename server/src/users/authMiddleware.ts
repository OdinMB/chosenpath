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

// Role constants
const ROLES = {
  ADMIN: "role_admin",
  USER: "role_user",
} as const;

type Role = (typeof ROLES)[keyof typeof ROLES];

interface AuthOptions {
  required?: boolean;
  roles?: Role[];
}

/**
 * Unified authentication and role verification middleware
 *
 * Usage:
 * - For any authenticated user: app.use('/protected-route', verifyUser())
 * - For admin only: app.use('/admin-route', verifyUser({ roles: [ROLES.ADMIN] }))
 * - For optional auth: app.use('/public-route', verifyUser({ required: false }))
 */
export function verifyUser(options: AuthOptions = { required: true }) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Extract token from cookie
    const token = req.cookies.authToken;

    if (!token) {
      if (options.required) {
        Logger.Route.warn(`Authentication failed: No token provided`);
        return res.status(401).json({
          error: "Authentication required",
          requestId: req.body?.requestId || "unknown",
        });
      }
      Logger.Route.log(
        `[${req.method}] ${req.path} - No token provided, continuing without authentication`
      );
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
        Logger.Route.log(
          `[${req.method}] ${req.path} - Invalid token, continuing without authentication`
        );
        return next(); // Continue without authentication for optional routes
      }

      // Add user and token to request object
      req.user = user;
      req.token = token;

      // Check role requirements if specified
      if (options.roles && options.roles.length > 0) {
        if (!options.roles.includes(user.roleId as Role)) {
          Logger.Route.warn(
            `Role verification failed for user: ${user.id} (has role: ${user.roleId})`
          );
          return res.status(403).json({
            error: "Insufficient permissions",
            requestId: req.body?.requestId || "unknown",
          });
        }
      }

      Logger.Route.log(
        `Authentication passed for user: ${user.username} (${user.id}): ${
          options.roles ? options.roles.join(", ") : "no roles required"
        }`
      );
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

// Convenience functions for common use cases
export const verifyAdmin = () =>
  verifyUser({ required: true, roles: [ROLES.ADMIN] });
export const verifyRegularUser = () =>
  verifyUser({ required: true, roles: [ROLES.USER] });
