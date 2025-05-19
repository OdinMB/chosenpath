import express from "express";
import {
  createUser,
  authenticateUser,
  logoutUser,
  updatePassword,
} from "users/userService.js";
import { verifyRegularUser, verifyUser } from "users/authMiddleware.js";
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
  GetUserStoryFeedResponse,
} from "core/types/api.js";
import { getStoryFeed } from "users/userStoryService.js";
import {
  checkRateLimitForRequest,
  incrementRateLimitForRequest,
} from "shared/rateLimiter.js";
import { API_CONFIG } from "server/config.js";

const router = express.Router();

// Password criteria utility functions
const MIN_PASSWORD_LENGTH = 8;
const hasMinLength = (pw: string) => pw.length >= MIN_PASSWORD_LENGTH;
const hasLowercase = (pw: string) => /[a-z]/.test(pw);
const hasUppercase = (pw: string) => /[A-Z]/.test(pw);
const hasNumber = (pw: string) => /\d/.test(pw);
const hasSpecialChar = (pw: string) =>
  /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?]/.test(pw);

/**
 * Register a new user
 * POST /auth/register
 */
router.post("/auth/register", async (req, res) => {
  const requestId = req.body?.requestId || "unknown";
  const { email, username, password } = req.body as RegisterUserRequest;

  if (!email || !username || !password) {
    return sendBadRequest(
      res,
      "Email, username, and password are required",
      requestId
    );
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return sendBadRequest(res, "Invalid email format", requestId);
  }

  const passwordCheck = {
    minLength: hasMinLength(password),
    lowercase: hasLowercase(password),
    uppercase: hasUppercase(password),
    number: hasNumber(password),
    specialChar: hasSpecialChar(password),
  };

  const criteriaMetCount = [
    passwordCheck.lowercase,
    passwordCheck.uppercase,
    passwordCheck.number,
    passwordCheck.specialChar,
  ].filter(Boolean).length;

  if (!passwordCheck.minLength || criteriaMetCount < 3) {
    // Construct a detailed message or a generic one
    let errorDetail: string[] = [];
    if (!passwordCheck.minLength)
      errorDetail.push(`be at least ${MIN_PASSWORD_LENGTH} characters`);
    if (criteriaMetCount < 3) {
      let unmetSubCriteria: string[] = [];
      if (!passwordCheck.lowercase) unmetSubCriteria.push("lowercase letter");
      if (!passwordCheck.uppercase) unmetSubCriteria.push("uppercase letter");
      if (!passwordCheck.number) unmetSubCriteria.push("number");
      if (!passwordCheck.specialChar)
        unmetSubCriteria.push("special character");
      errorDetail.push(
        `contain at least 3 of: ${unmetSubCriteria.slice(0, 2).join(", ")}${
          unmetSubCriteria.length > 2 ? "..." : ""
        }`
      ); // Keep it concise
    }

    return sendBadRequest(
      res,
      `Password must be 8+ characters and meet at least 3 of: lowercase, uppercase, number, or special character.`, // Generic message for client
      // `Password validation failed: ${errorDetail.join('; ')}`, // More detailed message for server log or specific client needs
      requestId
    );
  }

  try {
    const user = await createUser(email, username, password);
    return sendSuccess(res, { user }, requestId);
  } catch (error) {
    Logger.Route.error("User registration failed", error);
    const errorMessage =
      error instanceof Error ? error.message : "Registration failed";
    if (errorMessage === "Email already in use") {
      return sendBadRequest(
        res,
        "Email already in use. Please choose a different email.",
        requestId
      );
    }
    if (errorMessage === "Username already taken") {
      return sendBadRequest(
        res,
        "Username already taken. Please choose a different username.",
        requestId
      );
    }
    if (errorMessage.includes("already")) {
      return sendBadRequest(res, errorMessage, requestId);
    }
    return sendError(
      res,
      "An unexpected error occurred during registration.",
      500,
      requestId
    );
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

  const rateLimit = checkRateLimitForRequest(req, "login");
  if (rateLimit.isLimited) {
    return sendRateLimited(res, rateLimit, requestId);
  }

  try {
    const result = await authenticateUser(email, password, rememberMe);
    res.cookie("authToken", result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      expires: new Date(result.expiresAt),
      path: "/",
      domain:
        process.env.NODE_ENV === "production"
          ? `.${API_CONFIG.DEFAULT_DOMAIN}`
          : undefined,
    });
    incrementRateLimitForRequest(req, "login");
    return sendSuccess(res, { user: result.user }, requestId);
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
router.post("/auth/logout", verifyUser(), async (req, res) => {
  const requestId = req.body?.requestId || "unknown";
  const token = req.cookies.authToken;

  if (!token) {
    return sendUnauthorized(res, "No active session", requestId);
  }

  try {
    await logoutUser(token);
    res.clearCookie("authToken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "none",
      path: "/",
    });
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
router.get("/auth/me", verifyUser({ required: false }), (req, res) => {
  const requestId = (req.query.requestId as string) || "unknown";
  return sendSuccess(res, { user: req.user || null }, requestId);
});

/**
 * Update password
 * POST /auth/password
 */
router.post("/auth/password", verifyRegularUser(), async (req, res) => {
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
 * Get story feed for the current user or based on client story codes
 * GET /users/stories/feed
 * Query params: clientStoryCodes (optional, comma-separated string of story codes)
 * Returns: GetUserStoryFeedResponse
 */
router.get(
  "/users/stories/feed",
  verifyUser({ required: false }),
  async (req, res) => {
    const requestId = (req.query.requestId as string) || "unknown";
    const clientStoryCodesQuery = req.query.clientStoryCodes as
      | string
      | undefined;
    const clientStoryCodes = clientStoryCodesQuery
      ? clientStoryCodesQuery
          .split(",")
          .map((code) => code.trim())
          .filter((code) => code.length > 0)
      : undefined;

    try {
      const authUserId = req.user?.id;

      const stories = await getStoryFeed(authUserId, clientStoryCodes);
      return sendSuccess(res, { stories }, requestId);
    } catch (error) {
      Logger.Route.error("Failed to get user story feed", error);
      const errorMessage =
        error instanceof Error ? error.message : "Failed to get story feed";
      return sendError(res, errorMessage, 500, requestId);
    }
  }
);

export default router;
