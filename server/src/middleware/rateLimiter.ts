// Rate limiter implementation for limiting access to API endpoints
import { RateLimitedAction, RATE_LIMITS } from "shared/config.js";

// RateLimitRecord tracks requests for a specific IP and action
interface RateLimitRecord {
  count: number;
  resetAt: number;
}

// Store rate limit records by IP and action type
const rateLimits: Record<string, Record<string, RateLimitRecord>> = {};

/**
 * Normalizes IP addresses to handle various formats
 * @param ip The IP address to normalize
 * @returns Normalized IP address
 */
function normalizeIP(ip: string): string {
  // Clean up IPv6 prefix for local IPv4 addresses
  // (socket.io sometimes sends '::ffff:127.0.0.1' for localhost)
  if (ip.startsWith("::ffff:")) {
    return ip.substring(7);
  }

  // Handle case when IP includes port
  const colonIndex = ip.lastIndexOf(":");
  if (colonIndex !== -1 && !ip.includes(".", colonIndex)) {
    return ip.substring(0, colonIndex);
  }

  return ip;
}

// Clean expired records every 5 minutes
setInterval(() => {
  const now = Date.now();

  for (const ip in rateLimits) {
    for (const action in rateLimits[ip]) {
      if (rateLimits[ip][action].resetAt < now) {
        delete rateLimits[ip][action];
      }
    }

    // Clean up empty IP entries
    if (Object.keys(rateLimits[ip]).length === 0) {
      delete rateLimits[ip];
    }
  }
}, 5 * 60 * 1000);

/**
 * Check if a request is rate limited
 * @param ip The IP address to check
 * @param action The action type (MAKE_CHOICE or NEW_STORY)
 * @returns Object with isLimited flag and timeRemaining in ms
 */
export function checkRateLimit(
  ip: string,
  action: RateLimitedAction
): {
  isLimited: boolean;
  timeRemaining: number;
  requestsRemaining: number;
  maxRequests: number;
  windowMs: number;
} {
  // Normalize the IP address
  ip = normalizeIP(ip);

  const now = Date.now();
  const limitConfig = RATE_LIMITS[action];

  // Initialize rate limit records for this IP if they don't exist
  if (!rateLimits[ip]) {
    rateLimits[ip] = {};
  }

  // Initialize or reset record if expired
  if (!rateLimits[ip][action] || rateLimits[ip][action].resetAt < now) {
    rateLimits[ip][action] = {
      count: 0,
      resetAt: now + limitConfig.windowMs,
    };
  }

  // Get current record
  const record = rateLimits[ip][action];

  // Calculate requests remaining and time remaining
  const requestsRemaining = Math.max(0, limitConfig.maxRequests - record.count);
  const timeRemaining = Math.max(0, record.resetAt - now);

  return {
    isLimited: record.count >= limitConfig.maxRequests,
    timeRemaining,
    requestsRemaining,
    maxRequests: limitConfig.maxRequests,
    windowMs: limitConfig.windowMs,
  };
}

/**
 * Increment the request count for an IP and action
 * @param ip The IP address
 * @param action The action type (MAKE_CHOICE or NEW_STORY)
 */
export function incrementRateLimit(
  ip: string,
  action: RateLimitedAction
): void {
  // Normalize the IP address
  ip = normalizeIP(ip);

  const limitStatus = checkRateLimit(ip, action);

  // If not already limited, increment the count
  if (!limitStatus.isLimited) {
    rateLimits[ip][action].count += 1;
  }
}

/**
 * Get rate limit info for an IP address
 * @param ip The IP address
 * @returns Object containing rate limit info for each action type
 */
export function getRateLimitInfo(ip: string): Record<
  RateLimitedAction,
  {
    requestsRemaining: number;
    maxRequests: number;
    resetsAt: number;
  }
> {
  ip = normalizeIP(ip);

  const result: Record<RateLimitedAction, any> = {} as any;
  const now = Date.now();

  // For each action type, get the current status
  for (const action of Object.keys(RATE_LIMITS) as RateLimitedAction[]) {
    const limitConfig = RATE_LIMITS[action];
    const record = rateLimits[ip]?.[action];

    if (record && record.resetAt > now) {
      result[action] = {
        requestsRemaining: Math.max(0, limitConfig.maxRequests - record.count),
        maxRequests: limitConfig.maxRequests,
        resetsAt: record.resetAt,
      };
    } else {
      result[action] = {
        requestsRemaining: limitConfig.maxRequests,
        maxRequests: limitConfig.maxRequests,
        resetsAt: now + limitConfig.windowMs,
      };
    }
  }

  return result;
}

/**
 * Get the rate limit configuration
 */
export function getRateLimitConfig() {
  return { ...RATE_LIMITS };
}
