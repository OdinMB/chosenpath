// Environment detection
export const isDevelopment =
  typeof process !== "undefined"
    ? process.env.NODE_ENV === "development"
    : typeof window !== "undefined" &&
      (window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1");

// Only enable mocks in development environment
export const MOCK_STORIES_IN_DEVELOPMENT = false;
export const MOCK_STORIES_DELAY_MS = 4 * 1000;

// Story settings
export const MIN_PLAYERS = 1;
export const MAX_PLAYERS = 3;
export const MIN_TURNS = 5;
export const MAX_TURNS = 25;
export const DEFAULT_TURNS = 25;

export const POINTS_FOR_FAVORABLE_RESOLUTION = 30;
export const POINTS_FOR_MIXED_RESOLUTION = 0;
export const POINTS_FOR_UNFAVORABLE_RESOLUTION = -30;
export const POINTS_FOR_SACRIFICE = 30;
export const POINTS_FOR_REWARD = -30;

// Rate limiting configuration
export const RATE_LIMITED_ACTIONS = [
  "initialize_story",
  "verify_code",
  "make_choice",
  "join_game",
] as const;
export type RateLimitedAction = (typeof RATE_LIMITED_ACTIONS)[number];

export const CONTENT_MODERATION_ACTIONS = ["initialize_story"] as const;
export type ContentModerationAction =
  (typeof CONTENT_MODERATION_ACTIONS)[number];

// Rate limit configurations
export const RATE_LIMITS: Record<
  RateLimitedAction,
  {
    windowMs: number;
    maxRequests: number;
  }
> = {
  // Allow 1 request per 15 minutes for createStory
  initialize_story: {
    windowMs: 30 * 60 * 1000, // 30 minutes
    maxRequests: 2,
  },
  // Game choices rate limiting
  make_choice: {
    windowMs: 30 * 1000, // 30 seconds
    maxRequests: 6,
  },
  // Limit game join attempts
  join_game: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 30,
  },
  // Limit verify code attempts
  verify_code: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 15,
  },
};

// WebSocket keep-alive configuration
export const SOCKET_CONFIG = {
  // Client-side configuration
  CLIENT: {
    timeout: 300000, // 5 minutes in ms
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  },

  // Server-side configuration
  SERVER: {
    pingInterval: 25000, // Default ping interval (25 seconds)
    pingTimeout: 300000, // 5 minutes ping timeout
  },

  STALE_CONNECTION_CLEANUP_INTERVAL_MS: 1000 * 60 * 60 * 2, // 2 hours
  STALE_CONNECTION_THRESHOLD_MS: 1000 * 60 * 30, // 30 minutes
};

export const GAME_SESSION_CONFIG = {
  INACTIVE_SESSION_CLEANUP_INTERVAL_MS: 1000 * 60 * 60 * 2, // 2 hours
  INACTIVE_SESSION_THRESHOLD_MS: 1000 * 60 * 60 * 1, // 1 hour
};

// API and server configuration
export const API_CONFIG = {
  // Default ports
  DEFAULT_PORT: 3000,

  // Default URLs
  DEFAULT_API_URL: isDevelopment
    ? "http://localhost:3000"
    : "https://api.chosenpath.ai",

  // Default CORS origins
  DEFAULT_CORS_ORIGIN: isDevelopment
    ? ["http://localhost:5173"]
    : ["https://chosenpath.ai"],

  // Default domain
  DEFAULT_DOMAIN: "chosenpath.ai",
};
