import dotenv from "dotenv";
import { API_CONFIG } from "core/config.js";

// Load environment variables
dotenv.config();

// Parse comma-separated CORS origins into an array
const parseCorsOrigins = (origins: string): string[] => {
  return origins.split(",").map((origin) => origin.trim());
};

// Storage paths configuration
export const STORAGE_PATHS = {
  development: {
    stories: "../data/stories",
    templates: "../data/templates",
    mocks: "../data/mocks",
    temp: "../data/temp",
  },
  production: {
    stories: "/data/stories",
    templates: "/data/templates",
    mocks: "/data/mocks",
    temp: "/data/temp",
  },
};

export const config = {
  // Server settings
  port: process.env.PORT || API_CONFIG.DEFAULT_PORT,
  nodeEnv: process.env.NODE_ENV || "development",

  // CORS and domain settings
  corsOrigins: process.env.CORS_ORIGIN
    ? parseCorsOrigins(process.env.CORS_ORIGIN)
    : API_CONFIG.DEFAULT_CORS_ORIGIN,
  productionDomain: process.env.PRODUCTION_DOMAIN || API_CONFIG.DEFAULT_DOMAIN,

  // Authentication
  adminPassword: process.env.ADMIN_PASSWORD || "admin-dev-password",
} as const;

// OpenAI model settings
export const GENERATION_MODEL_NAME =
  process.env.GENERATION_MODEL_NAME || "gpt-4.1";
export const GENERATION_MODEL_REASONING_EFFORT =
  process.env.GENERATION_MODEL_REASONING_EFFORT || "medium";
export const GENERATION_MODEL_TEMPERATURE =
  process.env.GENERATION_MODEL_TEMPERATURE || 0.3;

export const TEXT_MODEL_NAME = process.env.TEXT_MODEL_NAME || "gpt-4.1-mini";
export const TEXT_MODEL_REASONING_EFFORT =
  process.env.TEXT_MODEL_REASONING_EFFORT || "medium";
export const TEXT_MODEL_TEMPERATURE = process.env.TEXT_MODEL_TEMPERATURE || 0.3;

export const IMAGE_QUERY_MODEL_NAME =
  process.env.IMAGE_QUERY_MODEL_NAME || "gpt-4.1-mini";
export const IMAGE_QUERY_MODEL_TEMPERATURE =
  process.env.IMAGE_QUERY_MODEL_TEMPERATURE || 0.1;

export const CONTENT_FILTER_MODEL_NAME =
  process.env.CONTENT_FILTER_MODEL_NAME || "gpt-4.1-mini";
export const CONTENT_FILTER_MODEL_TEMPERATURE =
  process.env.CONTENT_FILTER_MODEL_TEMPERATURE || 0;

// Image generation settings
export const IMAGE_GENERATION_MODEL =
  process.env.IMAGE_GENERATION_MODEL || "gpt-image-1";
export const IMAGE_GENERATION_OUTPUT_COMPRESSION = 90;
