import dotenv from "dotenv";

dotenv.config();

// Parse comma-separated CORS origins into an array
const parseCorsOrigins = (origins: string): string[] => {
  return origins.split(",").map((origin) => origin.trim());
};

export const config = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || "development",
  corsOrigins: process.env.CORS_ORIGIN
    ? parseCorsOrigins(process.env.CORS_ORIGIN)
    : ["http://localhost:5173"],
  productionDomain: process.env.PRODUCTION_DOMAIN || "chosenpath.ai",
  adminPassword: process.env.ADMIN_PASSWORD || "admin-dev-password",
} as const;
