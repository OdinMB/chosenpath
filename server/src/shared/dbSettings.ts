/**
 * The PostgreSQL connection settings the app uses, read from the environment.
 * Unset variables fall back to the local docker-compose database
 * (docker-compose.yml). db.ts builds its pool from this, and the dev seed's
 * guard (scripts/devSeedGuard.ts) checks the same settings before it connects.
 */
export type DbConnectionSettings = {
  user: string;
  host: string;
  database: string;
  password: string;
  port: number;
};

export function dbConnectionSettings(
  env: NodeJS.ProcessEnv
): DbConnectionSettings {
  return {
    user: env.DB_USER || "devuser",
    host: env.DB_HOST || "localhost",
    database: env.DB_DATABASE || "chosenpath_dev",
    password: env.DB_PASSWORD || "devpassword",
    port: parseInt(env.DB_PORT || "5432", 10),
  };
}
