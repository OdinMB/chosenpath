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

// Image generation settings (see .context/image-generation.md, "Models and settings").
// Models and qualities follow the owner's blind rating of 2026-09-24.
export const DEFAULT_IMAGE_GENERATION_MODEL = "gpt-image-2.5-flare";
export const DEFAULT_IMAGE_GENERATION_TEMPLATE_MODEL = "gpt-image-2.5-sunburst";
// In-game flows: beat illustrations, custom-story cover, custom-story player portraits.
export const IMAGE_GENERATION_MODEL =
  process.env.IMAGE_GENERATION_MODEL || DEFAULT_IMAGE_GENERATION_MODEL;
// Template editor flows: element images, player identity portraits, template cover.
// Does not follow IMAGE_GENERATION_MODEL: overriding one leaves the other on its default.
export const IMAGE_GENERATION_TEMPLATE_MODEL =
  process.env.IMAGE_GENERATION_TEMPLATE_MODEL ||
  DEFAULT_IMAGE_GENERATION_TEMPLATE_MODEL;
export const IMAGE_GENERATION_OUTPUT_COMPRESSION = 75;
// xhigh exists only on gpt-image-2.5; other models get high (openaiImageClient.ts).
export const IMAGE_GENERATION_TEMPLATE_COVER_QUALITY = IMAGE_QUALITIES.XHIGH;
export const IMAGE_GENERATION_TEMPLATE_PLAYER_QUALITY = IMAGE_QUALITIES.HIGH;
export const IMAGE_GENERATION_TEMPLATE_ELEMENT_QUALITY = IMAGE_QUALITIES.MEDIUM;
export const IMAGE_GENERATION_STORY_COVER_QUALITY = IMAGE_QUALITIES.HIGH;
export const IMAGE_GENERATION_STORY_PLAYER_QUALITY = IMAGE_QUALITIES.HIGH;
export const IMAGE_GENERATION_BEAT_QUALITY = IMAGE_QUALITIES.MEDIUM;
