// Only enable mocks in development environment
export const MOCK_STORIES_IN_DEVELOPMENT = true;
export const MOCK_STORIES_DELAY_MS = 3000;

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
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 1,
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
