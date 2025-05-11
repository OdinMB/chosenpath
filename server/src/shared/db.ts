import sqlite3 from "sqlite3";
import { open, Database } from "sqlite";
import path from "path";
import fs from "fs";
import { isDevelopment } from "server/config.js";
import { STORAGE_PATHS } from "server/config.js";
import { Logger } from "./logger.js";

// Get the appropriate storage path based on environment
const storagePath = isDevelopment
  ? STORAGE_PATHS.development
  : STORAGE_PATHS.production;

// Create the data directory if it doesn't exist
const dataDir = path.resolve(storagePath.temp, "..");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Database file path
const dbPath = path.resolve(dataDir, "db.sqlite");

let db: Database<sqlite3.Database, sqlite3.Statement>;

/**
 * Initialize the database connection and create tables if they don't exist
 */
export async function initializeDatabase() {
  try {
    Logger.DB.log(`Initializing database at ${dbPath}`);

    // Open the database connection
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });

    // Enable foreign keys
    await db.exec("PRAGMA foreign_keys = ON");

    // Create or update users table
    await db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        username TEXT UNIQUE NOT NULL,
        passwordHash TEXT NOT NULL,
        roleId TEXT NOT NULL,
        rememberToken TEXT,
        lastLoginAt INTEGER,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL,
        FOREIGN KEY (roleId) REFERENCES roles (id)
      )
    `);

    // Create or update roles table
    await db.exec(`
      CREATE TABLE IF NOT EXISTS roles (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        description TEXT,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL
      )
    `);

    // Create or update role_permissions table
    await db.exec(`
      CREATE TABLE IF NOT EXISTS role_permissions (
        roleId TEXT NOT NULL,
        permission TEXT NOT NULL,
        createdAt INTEGER NOT NULL,
        PRIMARY KEY (roleId, permission),
        FOREIGN KEY (roleId) REFERENCES roles (id) ON DELETE CASCADE
      )
    `);

    // Insert default roles if they don't exist
    await db.exec(`
      INSERT OR IGNORE INTO roles (id, name, description, createdAt, updatedAt)
      VALUES 
        ('role_user', 'user', 'Regular user with basic permissions', strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
        ('role_admin', 'admin', 'Administrator with full system access', strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000)
    `);

    // Insert default permissions for roles
    await db.exec(`
      INSERT OR IGNORE INTO role_permissions (roleId, permission, createdAt)
      VALUES 
        ('role_user', 'user:read', strftime('%s', 'now') * 1000),
        ('role_user', 'user:write', strftime('%s', 'now') * 1000),
        ('role_admin', 'user:read', strftime('%s', 'now') * 1000),
        ('role_admin', 'user:write', strftime('%s', 'now') * 1000),
        ('role_admin', 'admin:read', strftime('%s', 'now') * 1000),
        ('role_admin', 'admin:write', strftime('%s', 'now') * 1000)
    `);

    // Create or update sessions table
    await db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        expiresAt INTEGER NOT NULL,
        isRemembered BOOLEAN NOT NULL DEFAULT 0,
        createdAt INTEGER NOT NULL,
        FOREIGN KEY (userId) REFERENCES users (id) ON DELETE CASCADE
      )
    `);

    // Create or update stories table for story metadata
    await db.exec(`
      CREATE TABLE IF NOT EXISTS stories (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        templateId TEXT,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL,
        maxTurns INTEGER NOT NULL,
        generateImages BOOLEAN NOT NULL DEFAULT 1,
        creatorId TEXT,
        FOREIGN KEY (creatorId) REFERENCES users (id) ON DELETE SET NULL
      )
    `);

    // Check if story_players table exists
    const storyPlayersExists = await tableExists("story_players");

    if (!storyPlayersExists) {
      // Create new story_players table
      await db.exec(`
        CREATE TABLE story_players (
          storyId TEXT NOT NULL,
          playerSlot TEXT NOT NULL,
          code TEXT NOT NULL UNIQUE,
          userId TEXT,
          lastPlayedAt INTEGER,
          PRIMARY KEY (storyId, playerSlot),
          FOREIGN KEY (storyId) REFERENCES stories (id) ON DELETE CASCADE,
          FOREIGN KEY (userId) REFERENCES users (id) ON DELETE SET NULL
        )
      `);
    }

    // Create indexes for better performance
    await db.exec(`
      CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
      CREATE INDEX IF NOT EXISTS idx_users_username ON users (username);
      CREATE INDEX IF NOT EXISTS idx_sessions_userId ON sessions (userId);
      CREATE INDEX IF NOT EXISTS idx_sessions_expiresAt ON sessions (expiresAt);
      CREATE INDEX IF NOT EXISTS idx_stories_creatorId ON stories (creatorId);
      CREATE INDEX IF NOT EXISTS idx_story_players_code ON story_players (code);
      CREATE INDEX IF NOT EXISTS idx_story_players_userId ON story_players (userId);
    `);

    Logger.DB.log("Database initialized successfully");
    return db;
  } catch (error) {
    Logger.DB.error("Failed to initialize database", error);
    throw error;
  }
}

/**
 * Check if a table exists in the database
 */
async function tableExists(tableName: string): Promise<boolean> {
  try {
    const result = await db.get(
      `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
      tableName
    );
    return !!result;
  } catch (error) {
    Logger.DB.error(`Failed to check if table ${tableName} exists`, error);
    return false;
  }
}

/**
 * Get the database instance
 */
export function getDb(): Database<sqlite3.Database, sqlite3.Statement> {
  if (!db) {
    throw new Error(
      "Database not initialized. Call initializeDatabase() first."
    );
  }
  return db;
}

/**
 * Close the database connection
 */
export async function closeDatabase() {
  if (db) {
    await db.close();
    Logger.DB.log("Database connection closed");
  }
}
