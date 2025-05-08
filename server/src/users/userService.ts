import bcrypt from "bcrypt";
import { v4 as uuidv4 } from "uuid";
import jwt from "jsonwebtoken";
import { getDb } from "../shared/db.js";
import { Logger } from "../shared/logger.js";
import { UserDB, PublicUser, UserSession } from "core/types/user.js";

// JWT secret should be in environment variables in production
const JWT_SECRET = process.env.JWT_SECRET || "development-jwt-secret";
const SALT_ROUNDS = 10;

// Session durations
const SESSION_DURATION = {
  STANDARD: 24 * 60 * 60 * 1000, // 24 hours
  REMEMBERED: 30 * 24 * 60 * 60 * 1000, // 30 days
};

/**
 * Create a new user
 * @param email User's email
 * @param username User's username
 * @param password Plain text password
 */
export async function createUser(
  email: string,
  username: string,
  password: string
): Promise<PublicUser> {
  const db = getDb();

  try {
    // Check if user already exists
    const existingUser = await db.get(
      "SELECT * FROM users WHERE email = ? OR username = ?",
      [email.toLowerCase(), username]
    );

    if (existingUser) {
      if (existingUser.email.toLowerCase() === email.toLowerCase()) {
        throw new Error("Email already in use");
      } else {
        throw new Error("Username already taken");
      }
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // Create user
    const userId = uuidv4();
    const now = Date.now();

    await db.run(
      `INSERT INTO users (
        id, email, username, passwordHash, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, email.toLowerCase(), username, passwordHash, now, now]
    );

    Logger.DB.log(`Created new user: ${username} (${userId})`);

    return {
      id: userId,
      email,
      username,
      createdAt: now,
    };
  } catch (error) {
    Logger.DB.error("Failed to create user", error);
    throw error;
  }
}

/**
 * Authenticate a user and create a session
 * @param email User's email
 * @param password Plain text password
 * @param remember Whether to create a long-lived session
 */
export async function authenticateUser(
  email: string,
  password: string,
  remember = false
): Promise<{ user: PublicUser; token: string; expiresAt: number }> {
  const db = getDb();

  try {
    // Find user by email
    const user = await db.get<UserDB>("SELECT * FROM users WHERE email = ?", [
      email.toLowerCase(),
    ]);

    if (!user) {
      throw new Error("Invalid email or password");
    }

    // Check password
    const passwordMatch = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatch) {
      throw new Error("Invalid email or password");
    }

    // Create session
    const now = Date.now();
    const expiresAt =
      now +
      (remember ? SESSION_DURATION.REMEMBERED : SESSION_DURATION.STANDARD);

    // Generate JWT
    const token = jwt.sign(
      {
        userId: user.id,
        exp: Math.floor(expiresAt / 1000),
      },
      JWT_SECRET
    );

    // Store session in database
    await db.run(
      `INSERT INTO sessions (token, userId, expiresAt, isRemembered, createdAt)
       VALUES (?, ?, ?, ?, ?)`,
      [token, user.id, expiresAt, remember ? 1 : 0, now]
    );

    // Update last login time
    await db.run("UPDATE users SET lastLoginAt = ? WHERE id = ?", [
      now,
      user.id,
    ]);

    Logger.DB.log(`User logged in: ${user.username} (${user.id})`);

    return {
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        createdAt: user.createdAt,
      },
      token,
      expiresAt,
    };
  } catch (error) {
    Logger.DB.error("Authentication failed", error);
    throw error;
  }
}

/**
 * Verify a user's token
 * @param token The JWT token to verify
 */
export async function verifyToken(token: string): Promise<PublicUser | null> {
  const db = getDb();

  try {
    // Check if token exists and is not expired
    const session = await db.get<UserSession>(
      "SELECT * FROM sessions WHERE token = ? AND expiresAt > ?",
      [token, Date.now()]
    );

    if (!session) {
      return null;
    }

    // Verify JWT signature
    try {
      jwt.verify(token, JWT_SECRET);
    } catch (e) {
      // Token is invalid or expired
      await db.run("DELETE FROM sessions WHERE token = ?", [token]);
      return null;
    }

    // Get user
    const user = await db.get<UserDB>("SELECT * FROM users WHERE id = ?", [
      session.userId,
    ]);

    if (!user) {
      await db.run("DELETE FROM sessions WHERE token = ?", [token]);
      return null;
    }

    return {
      id: user.id,
      email: user.email,
      username: user.username,
      createdAt: user.createdAt,
    };
  } catch (error) {
    Logger.DB.error("Token verification failed", error);
    return null;
  }
}

/**
 * Logout a user by invalidating their token
 * @param token The token to invalidate
 */
export async function logoutUser(token: string): Promise<boolean> {
  const db = getDb();

  try {
    const result = await db.run("DELETE FROM sessions WHERE token = ?", [
      token,
    ]);
    return result.changes ? result.changes > 0 : false;
  } catch (error) {
    Logger.DB.error("Logout failed", error);
    return false;
  }
}

/**
 * Update a user's password
 * @param userId User ID
 * @param currentPassword Current password
 * @param newPassword New password
 */
export async function updatePassword(
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<boolean> {
  const db = getDb();

  try {
    // Get user
    const user = await db.get<UserDB>("SELECT * FROM users WHERE id = ?", [
      userId,
    ]);

    if (!user) {
      throw new Error("User not found");
    }

    // Verify current password
    const passwordMatch = await bcrypt.compare(
      currentPassword,
      user.passwordHash
    );
    if (!passwordMatch) {
      throw new Error("Current password is incorrect");
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

    // Update password
    await db.run(
      "UPDATE users SET passwordHash = ?, updatedAt = ? WHERE id = ?",
      [passwordHash, Date.now(), userId]
    );

    // Invalidate all sessions (force re-login)
    await db.run("DELETE FROM sessions WHERE userId = ?", [userId]);

    Logger.DB.log(`Password updated for user: ${user.username} (${userId})`);

    return true;
  } catch (error) {
    Logger.DB.error("Password update failed", error);
    throw error;
  }
}

/**
 * Clean up expired sessions
 */
export async function cleanupExpiredSessions(): Promise<number> {
  const db = getDb();

  try {
    const result = await db.run("DELETE FROM sessions WHERE expiresAt < ?", [
      Date.now(),
    ]);

    const changesCount = result.changes || 0;

    if (changesCount > 0) {
      Logger.DB.log(`Cleaned up ${changesCount} expired sessions`);
    }

    return changesCount;
  } catch (error) {
    Logger.DB.error("Failed to clean up expired sessions", error);
    return 0;
  }
}
