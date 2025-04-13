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
    timeout: 180000, // 3 minutes in ms
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  },

  // Server-side configuration
  SERVER: {
    pingInterval: 25000, // Default ping interval (25 seconds)
    pingTimeout: 180000, // 3 minutes ping timeout
  },

  // When to show the reload message after tab becomes visible again
  STALE_CONNECTION_THRESHOLD_MS: 180000, // 3 minutes
};

// Storage paths configuration
export const STORAGE_PATHS = {
  development: {
    stories: "data/stories",
    library: "data/templates",
    mocks: "data/mocks",
  },
  production: {
    stories: "/data/stories",
    library: "/data/templates",
    mocks: "/data/mocks",
  },
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
  DEFAULT_CORS_ORIGINS: isDevelopment
    ? ["http://localhost:5173"]
    : ["https://chosenpath.ai"],

  // Default domain
  DEFAULT_DOMAIN: "chosenpath.ai",
};
