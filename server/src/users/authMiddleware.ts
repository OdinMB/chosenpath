import { Request, Response, NextFunction } from "express";
import { verifyToken } from "./userService.js";
import { Logger } from "../shared/logger.js";
import { PublicUser } from "core/types/user.js";

// Extend Express Request to include user property
declare module "express-serve-static-core" {
  interface Request {
    user?: PublicUser;
    token?: string;
    userPermissions?: string[];
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

      // User permissions are now included in the user object from verifyToken
      req.userPermissions = user.permissions || [];

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
        `Authentication passed for user: ${user.username} (${user.id}), role: ${user.roleId}, permissions: [${req.userPermissions.join(", ")}]`
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

/**
 * Middleware to check if the user has specific permissions
 *
 * @param permissions Array of required permissions
 * @param requireAll If true, user must have all permissions. If false, any one is sufficient.
 */
export function checkPermissions(permissions: string[], requireAll = true) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      Logger.Route.warn(`Permission check failed: No authenticated user found for route ${req.path}`);
      return res.status(401).json({
        error: "Authentication required",
        requestId: req.body?.requestId || "unknown",
      });
    }

    const userPermissions = req.userPermissions || [];

    Logger.Route.log(
      `Checking permissions for user: ${req.user.username} (${req.user.id}). ` +
      `User has: [${userPermissions.join(", ")}], ` +
      `Required: [${permissions.join(", ")}] (${requireAll ? "all" : "any"})`
    );

    if (requireAll) {
      // User must have ALL specified permissions
      const hasAllPermissions = permissions.every((permission) =>
        userPermissions.includes(permission)
      );

      if (!hasAllPermissions) {
        const missingPermissions = permissions.filter(p => !userPermissions.includes(p));
        Logger.Route.warn(
          `Permission check failed for user: ${req.user.username} (${req.user.id}). ` +
          `Missing permissions: [${missingPermissions.join(", ")}]`
        );
        return res.status(403).json({
          error: "Insufficient permissions",
          requestId: req.body?.requestId || "unknown",
        });
      }
    } else {
      // User must have AT LEAST ONE of the specified permissions
      const hasAnyPermission = permissions.some((permission) =>
        userPermissions.includes(permission)
      );

      if (!hasAnyPermission) {
        Logger.Route.warn(
          `Permission check failed for user: ${req.user.username} (${req.user.id}). ` +
          `User has none of the required permissions: [${permissions.join(", ")}]`
        );
        return res.status(403).json({
          error: "Insufficient permissions",
          requestId: req.body?.requestId || "unknown",
        });
      }
    }

    Logger.Route.log(
      `Permission check passed for user: ${req.user.username} (${req.user.id})`
    );
    next();
  };
}

/**
 * Helper function to check if a user has specific permissions
 * Can be used within route handlers for complex permission logic
 *
 * @param req Express request object
 * @param permissions Array of permissions to check
 * @param requireAll If true, user must have all permissions. If false, any one is sufficient.
 * @returns Boolean indicating if user has the required permissions
 */
export function hasPermissions(
  req: Request,
  permissions: string[],
  requireAll = true
): boolean {
  if (!req.user || !req.userPermissions) {
    return false;
  }

  const userPermissions = req.userPermissions;

  if (requireAll) {
    return permissions.every((permission) =>
      userPermissions.includes(permission)
    );
  } else {
    return permissions.some((permission) =>
      userPermissions.includes(permission)
    );
  }
}

// Convenience functions for common use cases
export const verifyAdmin = () =>
  verifyUser({ required: true, roles: [ROLES.ADMIN] });
export const verifyRegularUser = () =>
  verifyUser({ required: true, roles: [ROLES.USER] });

// Template permission check functions
export const canSeeAllTemplates = () => checkPermissions(["templates_see_all"]);

export const canEditAllTemplates = () =>
  checkPermissions(["templates_edit_all"]);

export const canPublishTemplates = () =>
  checkPermissions(["templates_publish"]);

export const canManageCarousel = () => checkPermissions(["templates_carousel"]);

export const canCreateTemplates = () => checkPermissions(["templates_create"]);

export const canGenerateImages = () => checkPermissions(["templates_images"]);

export const canViewFeedback = () => checkPermissions(["feedback_view"]);

export const canDeleteFeedback = () => checkPermissions(["feedback_delete"]);
