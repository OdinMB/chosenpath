import dotenv from "dotenv";
import { getApiConfig } from "core/config.js";
import { IMAGE_QUALITIES } from "core/types/image.js";

// Load environment variables
dotenv.config();

// Environment detection
export const isDevelopment = process.env.NODE_ENV === "development";
export const API_CONFIG = getApiConfig(isDevelopment);

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

// OpenAI model settings
export const GENERATION_MODEL_NAME =
  process.env.GENERATION_MODEL_NAME || "gpt-4.1";
export const GENERATION_MODEL_TEMPERATURE =
  process.env.GENERATION_MODEL_TEMPERATURE || 0.3;

export const SWITCH_THREAD_MODEL_NAME =
  process.env.SWITCH_THREAD_MODEL_NAME || "gpt-4.1";
export const SWITCH_THREAD_MODEL_TEMPERATURE =
  process.env.SWITCH_THREAD_MODEL_TEMPERATURE || 0.1;

export const TEXT_MODEL_NAME = process.env.TEXT_MODEL_NAME || "gpt-4.1";
export const TEXT_MODEL_REASONING_EFFORT =
  process.env.TEXT_MODEL_REASONING_EFFORT || "medium";
export const TEXT_MODEL_TEMPERATURE = process.env.TEXT_MODEL_TEMPERATURE || 0.3;

// export const IMAGE_QUERY_MODEL_NAME =
//   process.env.IMAGE_QUERY_MODEL_NAME || "gpt-4.1-mini";
// export const IMAGE_QUERY_MODEL_TEMPERATURE =
//   process.env.IMAGE_QUERY_MODEL_TEMPERATURE || 0.1;

export const CONTENT_FILTER_MODEL_NAME =
  process.env.CONTENT_FILTER_MODEL_NAME || "gpt-4.1-mini";
export const CONTENT_FILTER_MODEL_TEMPERATURE =
  process.env.CONTENT_FILTER_MODEL_TEMPERATURE || 0;

// Image generation settings
export const IMAGE_GENERATION_MODEL =
  process.env.IMAGE_GENERATION_MODEL || "gpt-image-1";
export const IMAGE_GENERATION_OUTPUT_COMPRESSION = 90;
export const IMAGE_GENERATION_TEMPLATE_COVER_QUALITY = IMAGE_QUALITIES.HIGH;
export const IMAGE_GENERATION_TEMPLATE_PLAYER_QUALITY = IMAGE_QUALITIES.MEDIUM;
export const IMAGE_GENERATION_TEMPLATE_ELEMENT_QUALITY = IMAGE_QUALITIES.MEDIUM;
export const IMAGE_GENERATION_STORY_COVER_QUALITY = IMAGE_QUALITIES.MEDIUM;
export const IMAGE_GENERATION_STORY_PLAYER_QUALITY = IMAGE_QUALITIES.MEDIUM;
export const IMAGE_GENERATION_STORY_ELEMENT_QUALITY = IMAGE_QUALITIES.MEDIUM;
export const IMAGE_GENERATION_BEAT_QUALITY = IMAGE_QUALITIES.MEDIUM;
