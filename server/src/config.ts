import dotenv from "dotenv";
import {
  API_CONFIG,
  STORAGE_PATHS as SHARED_STORAGE_PATHS,
} from "@core/config.js";

// Load environment variables
dotenv.config();

// Parse comma-separated CORS origins into an array
const parseCorsOrigins = (origins: string): string[] => {
  return origins.split(",").map((origin) => origin.trim());
};

export const config = {
  // Server settings
  port: process.env.PORT || API_CONFIG.DEFAULT_PORT,
  nodeEnv: process.env.NODE_ENV || "development",

  // CORS and domain settings
  corsOrigins: process.env.CORS_ORIGIN
    ? parseCorsOrigins(process.env.CORS_ORIGIN)
    : API_CONFIG.DEFAULT_CORS_ORIGINS,
  productionDomain: process.env.PRODUCTION_DOMAIN || API_CONFIG.DEFAULT_DOMAIN,

  // Authentication
  adminPassword: process.env.ADMIN_PASSWORD || "admin-dev-password",
} as const;

// Use storage paths from shared config
export const STORAGE_PATHS = SHARED_STORAGE_PATHS;
