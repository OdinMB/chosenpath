import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { Logger } from "../shared/logger.js";
import { PublicUser } from "core/types/user.js";
import { SESSION_DURATION } from "../config.js";
import { userDbService } from "./UserDbService.js";

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
  try {
    const existingUser = await userDbService.findUserByEmailOrUsername(
      email,
      username
    );

    if (existingUser) {
      if (existingUser.email.toLowerCase() === email.toLowerCase()) {
        throw new Error("Email already in use");
      }
      throw new Error("Username already taken");
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const defaultRoleId = "role_user";

    const newUserEntry = await userDbService.createUserEntry(
      email,
      username,
      passwordHash,
      defaultRoleId
    );

    // Get permissions for the newly created user
    const permissions = await getUserPermissions(newUserEntry.id);

    return {
      id: newUserEntry.id,
      email: newUserEntry.email,
      username: newUserEntry.username,
      roleId: newUserEntry.roleId,
      createdAt: newUserEntry.createdAt,
      lastLoginAt: newUserEntry.lastLoginAt ?? null,
      permissions,
    };
  } catch (error) {
    Logger.DB.error("Failed to create user (service layer)", error);
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
  const lowerCaseEmail = email.toLowerCase();
  Logger.DB.log(`Attempting to authenticate user: ${lowerCaseEmail}`);

  try {
    const user = await userDbService.findUserByEmail(lowerCaseEmail);

    if (!user) {
      Logger.DB.warn(
        `Authentication failed: User not found with email ${lowerCaseEmail}`
      );
      throw new Error("Invalid email or password");
    }

    const passwordMatch = await bcrypt.compare(password, user.passwordHash);

    if (!passwordMatch) {
      Logger.DB.warn(
        `Authentication failed: Password mismatch for user ${user.id}`
      );
      throw new Error("Invalid email or password");
    }

    const now = Date.now();
    const expiresAt =
      now +
      (remember ? SESSION_DURATION.REMEMBERED : SESSION_DURATION.STANDARD);

    // Get user permissions to include in both JWT and response
    const permissions = await getUserPermissions(user.id);

    // Enhanced JWT payload with permissions and role
    const jwtPayload = {
      userId: user.id,
      username: user.username,
      roleId: user.roleId,
      permissions,
      exp: Math.floor(expiresAt / 1000),
      iat: Math.floor(now / 1000), // Issued at time for cache validation
    };

    const token = jwt.sign(jwtPayload, JWT_SECRET);

    await userDbService.createSessionEntry(token, user.id, expiresAt, remember);
    await userDbService.updateUserLastLogin(user.id, now);

    Logger.DB.log(
      `User logged in: ${user.username} (${user.id}) with ${permissions.length} permissions (cached in JWT)`
    );

    return {
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        roleId: user.roleId,
        createdAt: user.createdAt,
        lastLoginAt: now,
        permissions,
      },
      token,
      expiresAt,
    };
  } catch (error) {
    Logger.DB.error("Authentication failed (service layer)", error);
    throw error;
  }
}

/**
 * Verify a user's token with optimized permission caching
 * @param token The JWT token to verify
 */
export async function verifyToken(token: string): Promise<PublicUser | null> {
  try {
    const session = await userDbService.findSessionByToken(token);

    if (!session) return null;

    let decoded: any;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (e) {
      await userDbService.deleteSessionByToken(token);
      return null;
    }

    const user = await userDbService.findUserById(session.userId);

    if (!user) {
      await userDbService.deleteSessionByToken(token);
      return null;
    }

    // Use cached permissions from JWT (no fallback needed)
    if (decoded.permissions && decoded.roleId && decoded.username) {
      // Verify the role hasn't changed (basic security check)
      if (decoded.roleId === user.roleId) {
        // Use cached permissions from JWT
        Logger.DB.log(
          `Using cached permissions for user ${user.id} (${decoded.permissions.length} permissions)`
        );

        return {
          id: user.id,
          email: user.email,
          username: user.username,
          roleId: user.roleId,
          createdAt: user.createdAt,
          lastLoginAt: user.lastLoginAt ?? null,
          permissions: decoded.permissions,
        };
      } else {
        // Role changed, need to refresh token
        Logger.DB.warn(
          `Role mismatch for user ${user.id}: JWT has ${decoded.roleId}, DB has ${user.roleId}. Invalidating token.`
        );
        await userDbService.deleteSessionByToken(token);
        return null;
      }
    } else {
      // Invalid token format, force re-login
      Logger.DB.warn(
        `Token missing required fields for user ${user.id}, invalidating session`
      );
      await userDbService.deleteSessionByToken(token);
      return null;
    }
  } catch (error) {
    Logger.DB.error("Token verification failed (service layer)", error);
    return null;
  }
}

/**
 * Logout a user by invalidating their token
 * @param token The token to invalidate
 */
export async function logoutUser(token: string): Promise<boolean> {
  try {
    return await userDbService.deleteSessionByToken(token);
  } catch (error) {
    Logger.DB.error("Logout failed (service layer)", error);
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
  try {
    const user = await userDbService.findUserById(userId);
    if (!user) throw new Error("User not found");

    const passwordMatch = await bcrypt.compare(
      currentPassword,
      user.passwordHash
    );
    if (!passwordMatch) throw new Error("Current password is incorrect");

    const newPasswordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await userDbService.updateUserPasswordHash(userId, newPasswordHash);
    await userDbService.deleteAllUserSessions(userId);

    Logger.DB.log(`Password updated for user: ${user.username} (${userId})`);
    return true;
  } catch (error) {
    Logger.DB.error("Password update failed (service layer)", error);
    throw error;
  }
}

/**
 * Clean up expired sessions
 */
export async function cleanupExpiredSessions(): Promise<number> {
  try {
    const count = await userDbService.deleteExpiredSessions();
    if (count > 0) {
      Logger.DB.log(`Cleaned up ${count} expired sessions (via service)`);
    }
    return count;
  } catch (error) {
    Logger.DB.error(
      "Failed to clean up expired sessions (service layer)",
      error
    );
    return 0;
  }
}

/**
 * Get all users with their public information
 * Used for admin panels
 */
export async function getAllUsers(): Promise<PublicUser[]> {
  try {
    const users = await userDbService.getAllUserEntries();

    // Get permissions for all users
    const usersWithPermissions = await Promise.all(
      users.map(async (user) => {
        const permissions = await getUserPermissions(user.id);
        return {
          id: user.id,
          email: user.email,
          username: user.username,
          roleId: user.roleId,
          createdAt: user.createdAt,
          lastLoginAt: user.lastLoginAt ?? null,
          permissions,
        };
      })
    );

    return usersWithPermissions;
  } catch (error) {
    Logger.DB.error("Failed to get all users (service layer)", error);
    throw error;
  }
}

/**
 * Delete a user by ID
 * @param userId ID of the user to delete
 * @returns boolean indicating success
 */
export async function deleteUserById(userId: string): Promise<boolean> {
  try {
    const user = await userDbService.findUserById(userId);
    if (!user) return false;

    const deleted = await userDbService.deleteUserEntryById(userId);
    if (deleted) {
      Logger.DB.log(`Deleted user: ${user.username} (${userId}) (via service)`);
    }
    return deleted;
  } catch (error) {
    Logger.DB.error(`Failed to delete user: ${userId} (service layer)`, error);
    throw error;
  }
}

/**
 * Get permissions for a user
 * @param userId User ID
 * @returns Array of permission strings
 */
export async function getUserPermissions(userId: string): Promise<string[]> {
  try {
    const permissions = await userDbService.getUserPermissions(userId);
    return permissions;
  } catch (error) {
    Logger.DB.error(`Error getting permissions for user ${userId}`, error);
    return [];
  }
}

/**
 * Invalidate all sessions for a user (useful when permissions/role change)
 * @param userId User ID
 */
export async function invalidateUserSessions(userId: string): Promise<void> {
  try {
    await userDbService.deleteAllUserSessions(userId);
    Logger.DB.log(
      `Invalidated all sessions for user ${userId} due to permission changes`
    );
  } catch (error) {
    Logger.DB.error(`Failed to invalidate sessions for user ${userId}`, error);
    throw error;
  }
}

/**
 * Refresh JWT permissions for active session without requiring re-login
 * @param currentToken Current JWT token
 * @returns New token with refreshed permissions, or null if unable to refresh
 */
export async function refreshTokenPermissions(
  currentToken: string
): Promise<{ token: string; expiresAt: number; user: PublicUser } | null> {
  try {
    const session = await userDbService.findSessionByToken(currentToken);
    if (!session) return null;

    let decoded: any;
    try {
      decoded = jwt.verify(currentToken, JWT_SECRET);
    } catch (e) {
      return null;
    }

    const user = await userDbService.findUserById(session.userId);
    if (!user) return null;

    // Get fresh permissions
    const permissions = await getUserPermissions(user.id);

    // Create new token with same expiration as current session
    const jwtPayload = {
      userId: user.id,
      username: user.username,
      roleId: user.roleId,
      permissions,
      exp: decoded.exp, // Keep same expiration
      iat: Math.floor(Date.now() / 1000), // New issued time
    };

    const newToken = jwt.sign(jwtPayload, JWT_SECRET);

    // Update session token in database
    await userDbService.deleteSessionByToken(currentToken);
    await userDbService.createSessionEntry(
      newToken,
      user.id,
      session.expiresAt,
      session.isRemembered
    );

    Logger.DB.log(
      `Refreshed permissions for user ${user.id} (${permissions.length} permissions)`
    );

    return {
      token: newToken,
      expiresAt: session.expiresAt,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        roleId: user.roleId,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt ?? null,
        permissions,
      },
    };
  } catch (error) {
    Logger.DB.error("Failed to refresh token permissions", error);
    return null;
  }
}
