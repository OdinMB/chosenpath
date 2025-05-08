import sqlite3 from "sqlite3";
import { open, Database } from "sqlite";
import path from "path";
import fs from "fs";
import { config, STORAGE_PATHS } from "../config.js";
import { Logger } from "./logger.js";

// Get the appropriate storage path based on environment
const storagePath =
  config.nodeEnv === "production"
    ? STORAGE_PATHS.production
    : STORAGE_PATHS.development;

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

    // Create users table
    await db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        username TEXT UNIQUE NOT NULL,
        passwordHash TEXT NOT NULL,
        rememberToken TEXT,
        lastLoginAt INTEGER,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL
      )
    `);

    // Create sessions table
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

    // Create indexes for better performance
    await db.exec(`
      CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
      CREATE INDEX IF NOT EXISTS idx_users_username ON users (username);
      CREATE INDEX IF NOT EXISTS idx_sessions_userId ON sessions (userId);
      CREATE INDEX IF NOT EXISTS idx_sessions_expiresAt ON sessions (expiresAt);
    `);

    Logger.DB.log("Database initialized successfully");
    return db;
  } catch (error) {
    Logger.DB.error("Failed to initialize database", error);
    throw error;
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
