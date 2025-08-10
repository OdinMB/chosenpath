import { v4 as uuidv4 } from "uuid";
import { getDb } from "../shared/db.js";
import { Logger } from "../shared/logger.js";
import { UserDB, UserSession } from "core/types/user.js";

// Database row interfaces (snake_case from DB)
interface UserDbRow {
  id: string;
  email: string;
  username: string;
  password_hash: string;
  role_id: string;
  remember_token: string | null;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

interface UserSessionDbRow {
  token: string;
  user_id: string;
  expires_at: string;
  is_remembered: boolean;
  created_at: string;
}

// Helper to map snake_case DB row to camelCase UserDB
function mapRowToUserDB(row: UserDbRow): UserDB {
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    passwordHash: row.password_hash,
    roleId: row.role_id,
    rememberToken: row.remember_token || undefined,
    lastLoginAt: row.last_login_at ? parseInt(row.last_login_at, 10) : null,
    createdAt: parseInt(row.created_at, 10),
    updatedAt: parseInt(row.updated_at, 10),
  };
}

// Helper to map snake_case DB row to camelCase UserSession
function mapRowToUserSession(row: UserSessionDbRow): UserSession {
  return {
    token: row.token,
    userId: row.user_id,
    expiresAt: parseInt(row.expires_at, 10),
    isRemembered: row.is_remembered,
    createdAt: parseInt(row.created_at, 10),
  };
}

class UserDbService {
  /**
   * Find a user by email or username.
   */
  async findUserByEmailOrUsername(
    email?: string,
    username?: string
  ): Promise<UserDB | undefined> {
    if (!email && !username) {
      return undefined;
    }
    const pool = getDb();
    const conditions: string[] = [];
    const values: string[] = [];
    let queryText =
      "SELECT id, email, username, password_hash, role_id, remember_token, last_login_at, created_at, updated_at FROM users WHERE ";

    if (email) {
      conditions.push(`email = $${values.length + 1}`);
      values.push(email.toLowerCase());
    }
    if (username) {
      conditions.push(`username = $${values.length + 1}`);
      values.push(username);
    }
    queryText += conditions.join(" OR ");

    const result = await pool.query(queryText, values);
    return result.rows[0] ? mapRowToUserDB(result.rows[0] as UserDbRow) : undefined;
  }

  async findUserByEmail(email: string): Promise<UserDB | undefined> {
    const pool = getDb();
    const result = await pool.query(
      "SELECT id, email, username, password_hash, role_id, remember_token, last_login_at, created_at, updated_at FROM users WHERE email = $1",
      [email.toLowerCase()]
    );
    return result.rows[0] ? mapRowToUserDB(result.rows[0] as UserDbRow) : undefined;
  }

  async findUserById(userId: string): Promise<UserDB | undefined> {
    const pool = getDb();
    const result = await pool.query(
      "SELECT id, email, username, password_hash, role_id, remember_token, last_login_at, created_at, updated_at FROM users WHERE id = $1",
      [userId]
    );
    return result.rows[0] ? mapRowToUserDB(result.rows[0] as UserDbRow) : undefined;
  }

  /**
   * Create a new user in the database.
   */
  async createUserEntry(
    email: string,
    username: string,
    passwordHash: string,
    roleId: string
  ): Promise<UserDB> {
    const pool = getDb();
    const userId = uuidv4();
    const now = Date.now();
    const query = `
      INSERT INTO users (id, email, username, password_hash, role_id, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, email, username, password_hash, role_id, remember_token, last_login_at, created_at, updated_at
    `;
    const values = [
      userId,
      email.toLowerCase(),
      username,
      passwordHash,
      roleId,
      now,
      now,
    ];
    const result = await pool.query(query, values);
    Logger.Transaction.log(`Created new user entry: ${username} (${userId})`);
    return mapRowToUserDB(result.rows[0] as UserDbRow);
  }

  /**
   * Create a new session for a user.
   */
  async createSessionEntry(
    token: string,
    userId: string,
    expiresAt: number,
    isRemembered: boolean
  ): Promise<void> {
    const pool = getDb();
    const now = Date.now();
    const query = `
      INSERT INTO sessions (token, user_id, expires_at, is_remembered, created_at)
      VALUES ($1, $2, $3, $4, $5)
    `;
    await pool.query(query, [token, userId, expiresAt, isRemembered, now]);
  }

  /**
   * Update the last login time for a user.
   */
  async updateUserLastLogin(userId: string, loginTime: number): Promise<void> {
    const pool = getDb();
    await pool.query(
      "UPDATE users SET last_login_at = $1, updated_at = $2 WHERE id = $3",
      [loginTime, Date.now(), userId]
    );
    Logger.Transaction.log(`Updated last login for user ${userId}`);
  }

  /**
   * Find a session by token.
   */
  async findSessionByToken(token: string): Promise<UserSession | undefined> {
    const pool = getDb();
    const result = await pool.query(
      "SELECT token, user_id, expires_at, is_remembered, created_at FROM sessions WHERE token = $1 AND expires_at > $2",
      [token, Date.now()]
    );
    return result.rows[0] ? mapRowToUserSession(result.rows[0] as UserSessionDbRow) : undefined;
  }

  /**
   * Delete a session by token.
   */
  async deleteSessionByToken(token: string): Promise<boolean> {
    const pool = getDb();
    const result = await pool.query("DELETE FROM sessions WHERE token = $1", [
      token,
    ]);
    if (result.rowCount && result.rowCount > 0) {
      Logger.Transaction.log(`Deleted session token ${token}`);
    }
    return result.rowCount ? result.rowCount > 0 : false;
  }

  /**
   * Delete all sessions for a user.
   */
  async deleteAllUserSessions(userId: string): Promise<void> {
    const pool = getDb();
    await pool.query("DELETE FROM sessions WHERE user_id = $1", [userId]);
    Logger.Transaction.log(`Deleted all sessions for user ${userId}`);
  }

  /**
   * Update user's password hash.
   */
  async updateUserPasswordHash(
    userId: string,
    passwordHash: string
  ): Promise<void> {
    const pool = getDb();
    await pool.query(
      "UPDATE users SET password_hash = $1, updated_at = $2 WHERE id = $3",
      [passwordHash, Date.now(), userId]
    );
    Logger.Transaction.log(`Updated password for user ${userId}`);
  }

  /**
   * Delete expired sessions.
   */
  async deleteExpiredSessions(): Promise<number> {
    const pool = getDb();
    const result = await pool.query(
      "DELETE FROM sessions WHERE expires_at < $1",
      [Date.now()]
    );
    if (result.rowCount && result.rowCount > 0) {
      Logger.Transaction.log(`Deleted ${result.rowCount} expired sessions`);
    }
    return result.rowCount || 0;
  }

  /**
   * Get all user entries from the database.
   */
  async getAllUserEntries(): Promise<UserDB[]> {
    const pool = getDb();
    const result = await pool.query(
      "SELECT id, email, username, role_id, created_at, last_login_at, updated_at, password_hash, remember_token FROM users ORDER BY created_at DESC"
    );
    return result.rows.map(row => mapRowToUserDB(row as UserDbRow));
  }

  /**
   * Delete a user entry by ID.
   */
  async deleteUserEntryById(userId: string): Promise<boolean> {
    const pool = getDb();
    // Note: Related sessions should be deleted first or handled by ON DELETE CASCADE
    // Current schema has ON DELETE CASCADE for sessions.
    const result = await pool.query("DELETE FROM users WHERE id = $1", [
      userId,
    ]);
    if (result.rowCount && result.rowCount > 0) {
      Logger.Transaction.log(`Deleted user ${userId}`);
    }
    return result.rowCount ? result.rowCount > 0 : false;
  }

  /**
   * Get all permissions for a user by their ID.
   * This fetches permissions associated with the user's role from the role_permissions table.
   */
  async getUserPermissions(userId: string): Promise<string[]> {
    try {
      const pool = getDb();

      // First, get the user's role
      const userResult = await pool.query(
        "SELECT role_id FROM users WHERE id = $1",
        [userId]
      );

      if (!userResult.rows[0]) {
        Logger.DB.warn(
          `No user found with ID ${userId} when fetching permissions`
        );
        return [];
      }

      const roleId = userResult.rows[0].role_id;

      // Then get all permissions for that role
      const permissionsResult = await pool.query(
        "SELECT permission FROM role_permissions WHERE role_id = $1",
        [roleId]
      );

      const permissions = permissionsResult.rows.map((row) => row.permission);
      Logger.DB.log(
        `Retrieved ${permissions.length} permissions for user ${userId} with role ${roleId}`
      );

      return permissions;
    } catch (error) {
      Logger.DB.error(`Error retrieving permissions for user ${userId}`, error);
      return [];
    }
  }
}

export const userDbService = new UserDbService();
