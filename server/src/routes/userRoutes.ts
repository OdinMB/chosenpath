import express from "express";
import {
  createUser,
  authenticateUser,
  logoutUser,
  updatePassword,
} from "../users/userService.js";
import { authenticate } from "users/authMiddleware.js";
import { Logger } from "shared/logger.js";
import {
  sendSuccess,
  sendError,
  sendBadRequest,
  sendUnauthorized,
  sendRateLimited,
} from "shared/responseUtils.js";
import {
  RegisterUserRequest,
  LoginUserRequest,
  PasswordUpdateRequest,
  AssociateStoryCodeRequest,
} from "core/types/api.js";
import {
  getUserStoryCodes,
  associateStoryCode,
  getUserStories,
  getStoriesWithUser,
  getAllUserRelatedStories,
} from "users/userStoryService.js";
import { checkRateLimit, incrementRateLimit } from "shared/rateLimiter.js";

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

/**
 * Get story codes for the current user
 * GET /users/story-codes
 */
router.get("/users/story-codes", authenticate(), async (req, res) => {
  const requestId = (req.query.requestId as string) || "unknown";

  try {
    if (!req.user) {
      return sendUnauthorized(res, "Authentication required", requestId);
    }

    const storyCodes = await getUserStoryCodes(req.user.id);
    return sendSuccess(res, { storyCodes }, requestId);
  } catch (error) {
    Logger.Route.error("Failed to get user story codes", error);

    const errorMessage =
      error instanceof Error ? error.message : "Failed to get story codes";

    return sendError(res, errorMessage, 500, requestId);
  }
});

/**
 * Associate a story code with the current user
 * POST /users/story-codes
 */
router.post("/users/story-codes", authenticate(), async (req, res) => {
  const requestId = req.body?.requestId || "unknown";
  const { storyId, playerSlot, code } = req.body as AssociateStoryCodeRequest;

  if (!storyId || !playerSlot || !code) {
    return sendBadRequest(
      res,
      "Story ID, player slot, and code are required",
      requestId
    );
  }

  // Apply rate limiting
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const rateLimitStatus = checkRateLimit(ip, "associate_story_code");

  if (rateLimitStatus.isLimited) {
    return sendRateLimited(
      res,
      {
        action: "associate_story_code",
        timeRemaining: rateLimitStatus.timeRemaining,
        maxRequests: rateLimitStatus.maxRequests,
        windowMs: rateLimitStatus.windowMs,
        requestsRemaining: rateLimitStatus.requestsRemaining,
      },
      requestId
    );
  }

  try {
    if (!req.user) {
      return sendUnauthorized(res, "Authentication required", requestId);
    }

    // Increment rate limit
    incrementRateLimit(ip, "associate_story_code");

    const association = await associateStoryCode(
      req.user.id,
      storyId,
      playerSlot,
      code
    );

    return sendSuccess(res, { storyCode: association }, requestId);
  } catch (error) {
    Logger.Route.error("Failed to associate story code", error);

    const errorMessage =
      error instanceof Error ? error.message : "Failed to associate story code";

    return sendError(res, errorMessage, 500, requestId);
  }
});

/**
 * Get all stories related to the current user (both as creator and player)
 * GET /users/all-stories
 */
router.get("/users/all-stories", authenticate(), async (req, res) => {
  const requestId = (req.query.requestId as string) || "unknown";

  try {
    if (!req.user) {
      return sendUnauthorized(res, "Authentication required", requestId);
    }

    const stories = await getAllUserRelatedStories(req.user.id);
    return sendSuccess(res, { stories }, requestId);
  } catch (error) {
    Logger.Route.error("Failed to get all user related stories", error);

    const errorMessage =
      error instanceof Error ? error.message : "Failed to get stories";

    return sendError(res, errorMessage, 500, requestId);
  }
});

/**
 * Get stories created by the current user
 * GET /users/stories
 */
router.get("/users/stories", authenticate(), async (req, res) => {
  const requestId = (req.query.requestId as string) || "unknown";

  try {
    if (!req.user) {
      return sendUnauthorized(res, "Authentication required", requestId);
    }

    const stories = await getUserStories(req.user.id);
    return sendSuccess(res, { stories }, requestId);
  } catch (error) {
    Logger.Route.error("Failed to get user stories", error);

    const errorMessage =
      error instanceof Error ? error.message : "Failed to get stories";

    return sendError(res, errorMessage, 500, requestId);
  }
});

/**
 * Get stories where the user is a player (not necessarily the creator)
 * GET /users/player-stories
 */
router.get("/users/player-stories", authenticate(), async (req, res) => {
  const requestId = (req.query.requestId as string) || "unknown";

  try {
    if (!req.user) {
      return sendUnauthorized(res, "Authentication required", requestId);
    }

    const stories = await getStoriesWithUser(req.user.id);
    return sendSuccess(res, { stories }, requestId);
  } catch (error) {
    Logger.Route.error("Failed to get user player stories", error);

    const errorMessage =
      error instanceof Error ? error.message : "Failed to get stories";

    return sendError(res, errorMessage, 500, requestId);
  }
});

export default router;
