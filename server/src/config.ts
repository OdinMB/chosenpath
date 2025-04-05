import dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Parse comma-separated CORS origins into an array
const parseCorsOrigins = (origins: string): string[] => {
  return origins.split(",").map((origin) => origin.trim());
};

export const config = {
  // Server settings
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || "development",

  // CORS and domain settings
  corsOrigins: process.env.CORS_ORIGIN
    ? parseCorsOrigins(process.env.CORS_ORIGIN)
    : ["http://localhost:5173"],
  productionDomain: process.env.PRODUCTION_DOMAIN || "chosenpath.ai",

  // Authentication
  adminPassword: process.env.ADMIN_PASSWORD || "admin-dev-password",
} as const;

// Storage paths configuration
export const STORAGE_PATHS = {
  development: {
    stories: "data/stories",
    mocks: "data/mocks",
  },
  production: {
    stories: "/data/stories",
    mocks: "/data/mocks",
  },
};
