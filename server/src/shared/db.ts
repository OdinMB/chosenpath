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
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      )
    `);

    // Create or update users table (references roles)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role_id TEXT NOT NULL,
        remember_token TEXT,
        last_login_at BIGINT,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        FOREIGN KEY (role_id) REFERENCES roles (id)
      )
    `);

    // Create or update role_permissions table (references roles)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS role_permissions (
        role_id TEXT NOT NULL,
        permission TEXT NOT NULL,
        created_at BIGINT NOT NULL,
        PRIMARY KEY (role_id, permission),
        FOREIGN KEY (role_id) REFERENCES roles (id) ON DELETE CASCADE
      )
    `);

    // Insert default data after tables they depend on are created
    const nowEpochMs = Date.now();
    await pool.query(
      `
      INSERT INTO roles (id, name, description, created_at, updated_at)
      VALUES 
        ('role_user', 'user', 'Regular user with basic permissions', $1, $1),
        ('role_admin', 'admin', 'Administrator with full system access', $1, $1)
      ON CONFLICT (id) DO NOTHING
    `,
      [nowEpochMs]
    );

    await pool.query(
      `
      INSERT INTO role_permissions (role_id, permission, created_at)
      VALUES 
        ('role_user', 'templates_create', $1),
        ('role_admin', 'templates_see_all', $1),
        ('role_admin', 'templates_edit_all', $1),
        ('role_admin', 'templates_publish', $1),
        ('role_admin', 'templates_carousel', $1),
        ('role_admin', 'templates_create', $1),
        ('role_admin', 'templates_images', $1)
      ON CONFLICT (role_id, permission) DO NOTHING
    `,
      [nowEpochMs]
    );

    // Create or update sessions table (references users)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        expires_at BIGINT NOT NULL,
        is_remembered BOOLEAN NOT NULL DEFAULT FALSE,
        created_at BIGINT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      )
    `);

    // Create or update stories table for story metadata (references users)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS stories (
        id TEXT PRIMARY KEY,
        template_id TEXT,
        creator_id TEXT,
        generate_images BOOLEAN NOT NULL DEFAULT TRUE,
        max_turns INTEGER NOT NULL,
        difficulty_modifier INTEGER,
        difficulty_title TEXT,
        title TEXT,
        current_beat INTEGER NOT NULL DEFAULT 0,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        FOREIGN KEY (creator_id) REFERENCES users (id) ON DELETE SET NULL
      )
    `);

    // Create story_players table (references stories and users)
    // The check for table existence before creating is fine,
    // but we'll ensure it's created after 'stories' and 'users'.
    // For simplicity, we'll use CREATE TABLE IF NOT EXISTS directly,
    // as it handles the "already exists" case.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS story_players (
        story_id TEXT NOT NULL,
        player_slot TEXT NOT NULL,
        code TEXT NOT NULL UNIQUE,
        user_id TEXT,
        last_played_at BIGINT,
        is_pending BOOLEAN NOT NULL DEFAULT TRUE,
        PRIMARY KEY (story_id, player_slot),
        FOREIGN KEY (story_id) REFERENCES stories (id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
      )
    `);

    // Create feedback table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS feedback (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        rating TEXT,
        comment TEXT,
        story_id TEXT,
        story_title TEXT,
        contact_info TEXT,
        story_text TEXT,
        user_id TEXT,
        created_at BIGINT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
      )
    `);

    // Create templates table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS templates (
        id TEXT PRIMARY KEY,
        creator_id TEXT,
        publication_status TEXT NOT NULL DEFAULT 'draft',
        carousel_order INTEGER,
        contains_images BOOLEAN NOT NULL DEFAULT FALSE,
        title TEXT NOT NULL,
        teaser TEXT NOT NULL DEFAULT '',
        game_mode TEXT NOT NULL,
        tags TEXT NOT NULL DEFAULT '',
        player_count_min INTEGER NOT NULL,
        player_count_max INTEGER NOT NULL,
        max_turns_min INTEGER NOT NULL,
        max_turns_max INTEGER NOT NULL,
        difficulty_levels JSON NOT NULL DEFAULT '[]',
        show_on_welcome_screen BOOLEAN NOT NULL DEFAULT FALSE,
        order_value INTEGER NOT NULL DEFAULT 999,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        FOREIGN KEY (creator_id) REFERENCES users (id) ON DELETE SET NULL
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
      `CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions (user_id)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions (expires_at)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_stories_creator_id ON stories (creator_id)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_story_players_code ON story_players (code)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_story_players_user_id ON story_players (user_id)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_feedback_user_id ON feedback (user_id)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_feedback_story_id ON feedback (story_id)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_templates_creator_id ON templates (creator_id)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_templates_publication_status ON templates (publication_status)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_templates_game_mode ON templates (game_mode)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_templates_carousel_order ON templates (carousel_order)`
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
