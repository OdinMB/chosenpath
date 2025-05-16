import bcrypt from "bcrypt";
import { v4 as uuidv4 } from "uuid";
import jwt from "jsonwebtoken";
import { getDb } from "../shared/db.js";
import { Logger } from "../shared/logger.js";
import { UserDB, PublicUser, UserSession } from "core/types/user.js";
import { SESSION_DURATION } from "../config.js";

// JWT secret should be in environment variables in production
const JWT_SECRET = process.env.JWT_SECRET || "development-jwt-secret";
const SALT_ROUNDS = 10;

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
  const pool = getDb();

  try {
    // Check if user already exists
    const existingUserResult = await pool.query<UserDB>(
      "SELECT * FROM users WHERE email = $1 OR username = $2",
      [email.toLowerCase(), username]
    );
    const existingUser = existingUserResult.rows[0];

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
    const defaultRoleId = "role_user"; // Default role for new users

    await pool.query(
      `INSERT INTO users (
        id, email, username, passwordhash, roleid, createdat, updatedat
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        userId,
        email.toLowerCase(),
        username,
        passwordHash,
        defaultRoleId,
        now,
        now,
      ]
    );

    Logger.DB.log(`Created new user: ${username} (${userId})`);

    return {
      id: userId,
      email,
      username,
      roleId: defaultRoleId,
      createdAt: now,
      lastLoginAt: null,
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
  const pool = getDb();
  const lowerCaseEmail = email.toLowerCase(); // Store for logging
  Logger.DB.log(`Attempting to authenticate user: ${lowerCaseEmail}`);

  try {
    // Find user by email
    Logger.DB.log(`Querying for user with email: ${lowerCaseEmail}`);
    const userResult = await pool.query<UserDB>(
      "SELECT * FROM users WHERE email = $1",
      [lowerCaseEmail]
    );
    const user = userResult.rows[0];
    Logger.DB.log(`User query result - rows found: ${userResult.rows.length}`);

    if (!user) {
      Logger.DB.warn(
        `Authentication failed: User not found with email ${lowerCaseEmail}`
      );
      throw new Error("Invalid email or password");
    }
    Logger.DB.log(`User found: ${user.id}, email: ${user.email}`);

    // Check password
    Logger.DB.log(`Comparing password for user: ${user.id}`);
    const passwordMatch = await bcrypt.compare(password, user.passwordhash);
    Logger.DB.log(
      `Password match result for user ${user.id}: ${passwordMatch}`
    );

    if (!passwordMatch) {
      Logger.DB.warn(
        `Authentication failed: Password mismatch for user ${user.id}`
      );
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
    await pool.query(
      `INSERT INTO sessions (token, userid, expiresat, isremembered, createdat)
       VALUES ($1, $2, $3, $4, $5)`,
      [token, user.id, expiresAt, remember, now]
    );

    // Update last login time
    await pool.query("UPDATE users SET lastloginat = $1 WHERE id = $2", [
      now,
      user.id,
    ]);

    Logger.DB.log(`User logged in: ${user.username} (${user.id})`);

    return {
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        roleId: user.roleid,
        createdAt: parseInt(user.createdat, 10),
        lastLoginAt: now,
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
  const pool = getDb();

  try {
    // Check if token exists and is not expired
    const sessionResult = await pool.query<UserSession>(
      "SELECT * FROM sessions WHERE token = $1 AND expiresAt > $2",
      [token, Date.now()]
    );
    const session = sessionResult.rows[0];

    if (!session) {
      return null;
    }

    // Verify JWT signature
    try {
      jwt.verify(token, JWT_SECRET);
    } catch (e) {
      // Token is invalid or expired
      await pool.query("DELETE FROM sessions WHERE token = $1", [token]);
      return null;
    }

    // Get user
    const userResult = await pool.query<UserDB>(
      "SELECT * FROM users WHERE id = $1",
      [session.userid]
    );
    const user = userResult.rows[0];

    if (!user) {
      await pool.query("DELETE FROM sessions WHERE token = $1", [token]);
      return null;
    }

    const createdAtNum = parseInt(user.createdat, 10);
    const lastLoginAtNum = user.lastloginat
      ? parseInt(user.lastloginat, 10)
      : null;

    return {
      id: user.id,
      email: user.email,
      username: user.username,
      roleId: user.roleid,
      createdAt: isNaN(createdAtNum) ? 0 : createdAtNum,
      lastLoginAt:
        lastLoginAtNum === null || isNaN(lastLoginAtNum)
          ? null
          : lastLoginAtNum,
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
  const pool = getDb();

  try {
    const result = await pool.query("DELETE FROM sessions WHERE token = $1", [
      token,
    ]);
    return result.rowCount ? result.rowCount > 0 : false;
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
  const pool = getDb();

  try {
    // Get user
    const userResult = await pool.query<UserDB>(
      "SELECT * FROM users WHERE id = $1",
      [userId]
    );
    const user = userResult.rows[0];

    if (!user) {
      throw new Error("User not found");
    }

    // Verify current password
    const passwordMatch = await bcrypt.compare(
      currentPassword,
      user.passwordhash
    );
    if (!passwordMatch) {
      throw new Error("Current password is incorrect");
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

    // Update password
    await pool.query(
      "UPDATE users SET passwordhash = $1, updatedat = $2 WHERE id = $3",
      [passwordHash, Date.now(), userId]
    );

    // Invalidate all sessions (force re-login)
    await pool.query("DELETE FROM sessions WHERE userid = $1", [userId]);

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
  const pool = getDb();

  try {
    const result = await pool.query(
      "DELETE FROM sessions WHERE expiresAt < $1",
      [Date.now()]
    );

    const changesCount = result.rowCount || 0;

    if (changesCount > 0) {
      Logger.DB.log(`Cleaned up ${changesCount} expired sessions`);
    }

    return changesCount;
  } catch (error) {
    Logger.DB.error("Failed to clean up expired sessions", error);
    return 0;
  }
}

/**
 * Get all users with their public information
 * Used for admin panels
 */
export async function getAllUsers(): Promise<PublicUser[]> {
  const pool = getDb();

  try {
    const usersResult = await pool.query<UserDB>(
      "SELECT id, email, username, roleid, createdat, lastloginat FROM users ORDER BY createdat DESC"
    );
    const users: UserDB[] = usersResult.rows;

    return users.map((user) => {
      const createdAtNum = parseInt(user.createdat, 10);
      const lastLoginAtNum = user.lastloginat
        ? parseInt(user.lastloginat, 10)
        : null;

      return {
        id: user.id,
        email: user.email,
        username: user.username,
        roleId: user.roleid,
        createdAt: isNaN(createdAtNum) ? 0 : createdAtNum,
        lastLoginAt:
          lastLoginAtNum === null || isNaN(lastLoginAtNum)
            ? null
            : lastLoginAtNum,
      };
    });
  } catch (error) {
    Logger.DB.error("Failed to get all users", error);
    throw error;
  }
}

/**
 * Delete a user by ID
 * @param userId ID of the user to delete
 * @returns boolean indicating success
 */
export async function deleteUserById(userId: string): Promise<boolean> {
  const pool = getDb();

  try {
    // First check if user exists
    const userResult = await pool.query<UserDB>(
      "SELECT * FROM users WHERE id = $1",
      [userId]
    );
    const user = userResult.rows[0];

    if (!user) {
      return false;
    }

    // Delete user's sessions
    await pool.query("DELETE FROM sessions WHERE userid = $1", [userId]);

    // Delete the user
    const result = await pool.query("DELETE FROM users WHERE id = $1", [
      userId,
    ]);

    Logger.DB.log(`Deleted user: ${user.username} (${userId})`);

    return result.rowCount ? result.rowCount > 0 : false;
  } catch (error) {
    Logger.DB.error(`Failed to delete user: ${userId}`, error);
    throw error;
  }
}
