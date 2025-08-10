import dotenv from "dotenv";
import { getApiConfig } from "core/config.js";
import { IMAGE_QUALITIES } from "core/types/image.js";

// Load environment variables
dotenv.config();

// Environment detection
export const isDevelopment = process.env.NODE_ENV === "development";
export const API_CONFIG = getApiConfig(isDevelopment);

// Session durations (moved from userService)
export const SESSION_DURATION = {
  STANDARD: 24 * 60 * 60 * 1000, // 24 hours
  REMEMBERED: 30 * 24 * 60 * 60 * 1000, // 30 days
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

export const MODEL_BASE_REASONING = false;
const OPENAI_MODEL_BASE = "gpt-4.1";
const OPENAI_MODEL_BASE_TEMPERATURE = 0.2;
const OPENAI_MODEL_BASE_REASONING_EFFORT = "minimal";

// Model settings
export const GENERATION_MODEL_NAME =
  process.env.GENERATION_MODEL_NAME || `${OPENAI_MODEL_BASE}`;
export const GENERATION_MODEL_TEMPERATURE =
  process.env.GENERATION_MODEL_TEMPERATURE || OPENAI_MODEL_BASE_TEMPERATURE;
export const GENERATION_MODEL_REASONING_EFFORT =
  process.env.GENERATION_MODEL_REASONING_EFFORT ||
  OPENAI_MODEL_BASE_REASONING_EFFORT;

export const SWITCH_THREAD_MODEL_NAME =
  process.env.SWITCH_THREAD_MODEL_NAME || `${OPENAI_MODEL_BASE}-mini`;
export const SWITCH_THREAD_MODEL_TEMPERATURE =
  process.env.SWITCH_THREAD_MODEL_TEMPERATURE || OPENAI_MODEL_BASE_TEMPERATURE;
export const SWITCH_THREAD_MODEL_REASONING_EFFORT =
  process.env.SWITCH_THREAD_MODEL_REASONING_EFFORT ||
  OPENAI_MODEL_BASE_REASONING_EFFORT;

export const TEXT_MODEL_NAME =
  process.env.TEXT_MODEL_NAME || `${OPENAI_MODEL_BASE}-mini`;
export const TEXT_MODEL_TEMPERATURE =
  process.env.TEXT_MODEL_TEMPERATURE || OPENAI_MODEL_BASE_TEMPERATURE;
export const TEXT_MODEL_REASONING_EFFORT =
  process.env.TEXT_MODEL_REASONING_EFFORT || OPENAI_MODEL_BASE_REASONING_EFFORT;

export const CONTENT_FILTER_MODEL_NAME =
  process.env.CONTENT_FILTER_MODEL_NAME || `${OPENAI_MODEL_BASE}-mini`;
export const CONTENT_FILTER_MODEL_TEMPERATURE =
  process.env.CONTENT_FILTER_MODEL_TEMPERATURE || OPENAI_MODEL_BASE_TEMPERATURE;

// Image generation settings
export const IMAGE_GENERATION_MODEL =
  process.env.IMAGE_GENERATION_MODEL || "gpt-image-1";
export const IMAGE_GENERATION_OUTPUT_COMPRESSION = 75;
export const IMAGE_GENERATION_TEMPLATE_COVER_QUALITY = IMAGE_QUALITIES.HIGH;
export const IMAGE_GENERATION_TEMPLATE_PLAYER_QUALITY = IMAGE_QUALITIES.MEDIUM;
export const IMAGE_GENERATION_TEMPLATE_ELEMENT_QUALITY = IMAGE_QUALITIES.MEDIUM;
export const IMAGE_GENERATION_STORY_COVER_QUALITY = IMAGE_QUALITIES.MEDIUM;
export const IMAGE_GENERATION_STORY_PLAYER_QUALITY = IMAGE_QUALITIES.MEDIUM;
export const IMAGE_GENERATION_STORY_ELEMENT_QUALITY = IMAGE_QUALITIES.MEDIUM;
export const IMAGE_GENERATION_BEAT_QUALITY = IMAGE_QUALITIES.MEDIUM;
