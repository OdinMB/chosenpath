import express from "express";
import {
  createUser,
  authenticateUser,
  logoutUser,
  updatePassword,
} from "../users/userService.js";
import { authenticate } from "../users/authMiddleware.js";
import { Logger } from "../shared/logger.js";
import {
  sendSuccess,
  sendError,
  sendBadRequest,
  sendUnauthorized,
} from "../shared/responseUtils.js";
import {
  RegisterUserRequest,
  LoginUserRequest,
  PasswordUpdateRequest,
} from "core/types/api.js";

const router = express.Router();

/**
 * Register a new user
 * POST /auth/register
 */
router.post("/auth/register", async (req, res) => {
  const requestId = req.body?.requestId || "unknown";
  const { email, username, password } = req.body as RegisterUserRequest;

  // Validate input
  if (!email || !username || !password) {
    return sendBadRequest(
      res,
      "Email, username, and password are required",
      requestId
    );
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return sendBadRequest(res, "Invalid email format", requestId);
  }

  // Validate password strength
  if (password.length < 8) {
    return sendBadRequest(
      res,
      "Password must be at least 8 characters long",
      requestId
    );
  }

  try {
    const user = await createUser(email, username, password);
    return sendSuccess(res, { user }, requestId);
  } catch (error) {
    Logger.Route.error("User registration failed", error);

    // Handle specific errors
    const errorMessage =
      error instanceof Error ? error.message : "Registration failed";

    if (errorMessage.includes("already")) {
      return sendBadRequest(res, errorMessage, requestId);
    }

    return sendError(res, errorMessage, 500, requestId);
  }
});

/**
 * Login user
 * POST /auth/login
 */
router.post("/auth/login", async (req, res) => {
  const requestId = req.body?.requestId || "unknown";
  const { email, password, rememberMe } = req.body as LoginUserRequest;

  if (!email || !password) {
    return sendBadRequest(res, "Email and password are required", requestId);
  }

  try {
    const result = await authenticateUser(email, password, rememberMe);
    return sendSuccess(res, result, requestId);
  } catch (error) {
    Logger.Route.warn(`Login failed for email: ${email}`);

    const errorMessage =
      error instanceof Error ? error.message : "Authentication failed";
    return sendUnauthorized(res, errorMessage, requestId);
  }
});

/**
 * Logout user
 * POST /auth/logout
 */
router.post("/auth/logout", authenticate(), async (req, res) => {
  const requestId = req.body?.requestId || "unknown";
  const token = req.token;

  if (!token) {
    return sendUnauthorized(res, "No active session", requestId);
  }

  try {
    await logoutUser(token);
    return sendSuccess(res, { message: "Logged out successfully" }, requestId);
  } catch (error) {
    Logger.Route.error("Logout failed", error);
    return sendError(res, "Failed to log out", 500, requestId);
  }
});

/**
 * Get current user
 * GET /auth/me
 */
router.get("/auth/me", authenticate(), (req, res) => {
  const requestId = (req.query.requestId as string) || "unknown";
  return sendSuccess(res, { user: req.user }, requestId);
});

/**
 * Update password
 * POST /auth/password
 */
router.post("/auth/password", authenticate(), async (req, res) => {
  const requestId = req.body?.requestId || "unknown";
  const { currentPassword, newPassword } = req.body as PasswordUpdateRequest;

  if (!currentPassword || !newPassword) {
    return sendBadRequest(
      res,
      "Current password and new password are required",
      requestId
    );
  }

  if (newPassword.length < 8) {
    return sendBadRequest(
      res,
      "New password must be at least 8 characters long",
      requestId
    );
  }

  try {
    if (!req.user) {
      return sendUnauthorized(res, "Authentication required", requestId);
    }

    await updatePassword(req.user.id, currentPassword, newPassword);
    return sendSuccess(
      res,
      { message: "Password updated successfully" },
      requestId
    );
  } catch (error) {
    Logger.Route.error("Password update failed", error);

    const errorMessage =
      error instanceof Error ? error.message : "Password update failed";

    if (errorMessage.includes("incorrect")) {
      return sendBadRequest(res, errorMessage, requestId);
    }

    return sendError(res, errorMessage, 500, requestId);
  }
});

export default router;
