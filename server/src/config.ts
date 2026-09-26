import dotenv from "dotenv";
import { getApiConfig } from "core/config.js";
import { IMAGE_QUALITIES } from "core/types/image.js";
import { resolveTextModelConfig } from "shared/llm/textModelSettings.js";

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

// Text model settings per role (defaults and env names: shared/llm/textModelSettings.ts).
// Throws at startup on an unsupported model or a gpt-6 model without an effort.
export const TEXT_MODEL_CONFIG = resolveTextModelConfig(process.env);

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
