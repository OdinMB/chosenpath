import express from "express";
import { Logger } from "shared/logger.js";
import { sendError } from "shared/responseUtils.js";
import { config } from "server/config.js";

/**
 * Authentication middleware for admin routes
 */
export const verifyAdmin = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  const authHeader = req.headers.authorization;
  const requestId =
    (req.query.requestId as string) ||
    (req.body && req.body.requestId) ||
    "unknown";

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    Logger.Route.error(
      "Authentication failed: missing or invalid Authorization header"
    );
    return sendError(res, "Authentication required", 401, requestId);
  }

  const token = authHeader.split(" ")[1];

  // Simple password check - should be replaced with a more secure method in production
  if (token !== config.adminPassword) {
    Logger.Route.error("Authentication failed: invalid password");
    return sendError(res, "Invalid credentials", 403, requestId);
  }

  Logger.Route.log("Authentication successful");
  next();
};
