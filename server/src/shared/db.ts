import { Pool } from "pg";
import { Logger } from "./logger.js";

// PostgreSQL connection pool
// For production, use environment variables provided by Render.
// For local development, these match your docker-compose.yml.
const pool = new Pool({
  user: process.env.DB_USER || "devuser",
  host: process.env.DB_HOST || "localhost",
  database: process.env.DB_DATABASE || "chosenpath_dev",
  password: process.env.DB_PASSWORD || "devpassword",
  port: parseInt(process.env.DB_PORT || "5432", 10),
});

pool.on("error", (err, client) => {
  Logger.DB.error("Unexpected error on idle client", err);
  process.exit(-1);
});

/**
 * Initialize the database connection and create tables if they don't exist
 */
export async function initializeDatabase() {
  try {
    Logger.DB.log("Initializing PostgreSQL database...");

    // Test the connection
    await pool.query("SELECT NOW()");
    Logger.DB.log("PostgreSQL connected successfully.");

    // Create or update roles table (must be created before users)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS roles (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        description TEXT,
        createdAt BIGINT NOT NULL,
        updatedAt BIGINT NOT NULL
      )
    `);

    // Create or update users table (references roles)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        username TEXT UNIQUE NOT NULL,
        passwordHash TEXT NOT NULL,
        roleId TEXT NOT NULL,
        rememberToken TEXT,
        lastLoginAt BIGINT,
        createdAt BIGINT NOT NULL,
        updatedAt BIGINT NOT NULL,
        FOREIGN KEY (roleId) REFERENCES roles (id)
      )
    `);

    // Create or update role_permissions table (references roles)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS role_permissions (
        roleId TEXT NOT NULL,
        permission TEXT NOT NULL,
        createdAt BIGINT NOT NULL,
        PRIMARY KEY (roleId, permission),
        FOREIGN KEY (roleId) REFERENCES roles (id) ON DELETE CASCADE
      )
    `);

    // Insert default data after tables they depend on are created
    const nowEpochMs = Date.now();
    await pool.query(
      `
      INSERT INTO roles (id, name, description, createdAt, updatedAt)
      VALUES 
        ('role_user', 'user', 'Regular user with basic permissions', $1, $1),
        ('role_admin', 'admin', 'Administrator with full system access', $1, $1)
      ON CONFLICT (id) DO NOTHING
    `,
      [nowEpochMs]
    );

    await pool.query(
      `
      INSERT INTO role_permissions (roleId, permission, createdAt)
      VALUES 
        ('role_user', 'user:read', $1),
        ('role_user', 'user:write', $1),
        ('role_admin', 'user:read', $1),
        ('role_admin', 'user:write', $1),
        ('role_admin', 'admin:read', $1),
        ('role_admin', 'admin:write', $1)
      ON CONFLICT (roleId, permission) DO NOTHING
    `,
      [nowEpochMs]
    );

    // Create or update sessions table (references users)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        expiresAt BIGINT NOT NULL,
        isRemembered BOOLEAN NOT NULL DEFAULT FALSE,
        createdAt BIGINT NOT NULL,
        FOREIGN KEY (userId) REFERENCES users (id) ON DELETE CASCADE
      )
    `);

    // Create or update stories table for story metadata (references users)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS stories (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        templateId TEXT,
        createdAt BIGINT NOT NULL,
        updatedAt BIGINT NOT NULL,
        maxTurns INTEGER NOT NULL,
        generateImages BOOLEAN NOT NULL DEFAULT TRUE,
        creatorId TEXT,
        FOREIGN KEY (creatorId) REFERENCES users (id) ON DELETE SET NULL
      )
    `);

    // Create story_players table (references stories and users)
    // The check for table existence before creating is fine,
    // but we'll ensure it's created after 'stories' and 'users'.
    // For simplicity, we'll use CREATE TABLE IF NOT EXISTS directly,
    // as it handles the "already exists" case.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS story_players (
        storyId TEXT NOT NULL,
        playerSlot TEXT NOT NULL,
        code TEXT NOT NULL UNIQUE,
        userId TEXT,
        lastPlayedAt BIGINT,
        PRIMARY KEY (storyId, playerSlot),
        FOREIGN KEY (storyId) REFERENCES stories (id) ON DELETE CASCADE,
        FOREIGN KEY (userId) REFERENCES users (id) ON DELETE SET NULL
      )
    `);

    // Create indexes for better performance
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_users_email ON users (email)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_users_username ON users (username)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_sessions_userId ON sessions (userId)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_sessions_expiresAt ON sessions (expiresAt)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_stories_creatorId ON stories (creatorId)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_story_players_code ON story_players (code)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_story_players_userId ON story_players (userId)`
    );

    Logger.DB.log("PostgreSQL database initialized successfully");
    return pool; // Returning the pool itself might be useful, or not, depending on usage.
  } catch (error) {
    Logger.DB.error("Failed to initialize PostgreSQL database", error);
    throw error;
  }
}

/**
 * Check if a table exists in the database
 */
async function tableExists(tableName: string): Promise<boolean> {
  try {
    const result = await pool.query(
      "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = $1 AND table_schema = 'public')",
      [tableName]
    );
    return result.rows[0].exists;
  } catch (error) {
    Logger.DB.error(`Failed to check if table ${tableName} exists`, error);
    return false; // Or throw, depending on desired error handling
  }
}

/**
 * Get the database instance (the pool)
 */
export function getDb(): Pool {
  if (!pool) {
    // This case should ideally not happen if pool is initialized at module scope
    // and initializeDatabase is called at startup.
    throw new Error(
      "Database not initialized. Call initializeDatabase() first."
    );
  }
  return pool;
}

/**
 * Close the database connection pool
 */
export async function closeDatabase() {
  if (pool) {
    await pool.end();
    Logger.DB.log("PostgreSQL database connection pool closed");
  }
}
