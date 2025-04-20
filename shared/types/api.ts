import { RateLimitedAction } from "../config.js";

// Base client request type
export interface ClientRequest {
  requestId?: string;
}

/**
 * Standardized response status types for all API requests
 */
export enum ResponseStatus {
  RATE_LIMITED = "rate_limited",
  INVALID = "invalid",
  ERROR = "error",
  SUCCESS = "success",
}

/**
 * Rate limit information returned when a request is limited
 */
export interface RateLimitInfo {
  action: RateLimitedAction;
  timeRemaining: number;
  maxRequests?: number;
  windowMs?: number;
  requestsRemaining: number;
}

/**
 * Base response for all server responses
 */
export interface BaseServerResponse {
  requestId: string;
  status: ResponseStatus;
  timestamp: number;
}

/**
 * Rate limited response for rate-limited requests
 */
export interface RateLimitedResponse extends BaseServerResponse {
  status: ResponseStatus.RATE_LIMITED;
  rateLimit: RateLimitInfo;
}

/**
 * Success response with data
 */
export interface SuccessResponse<T = unknown> extends BaseServerResponse {
  status: ResponseStatus.SUCCESS;
  data: T;
}

/**
 * Error response for invalid input or processing errors
 */
export interface ErrorResponse extends BaseServerResponse {
  status: ResponseStatus.ERROR | ResponseStatus.INVALID;
  errorMessage: string;
  operationType?: string;
}
