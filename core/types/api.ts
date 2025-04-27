import { RateLimitedAction, ContentModerationAction } from "../config.js";
import { ImageQuality, ImageSize, ImageInstructions } from "./index.js";

// Base client request type
export interface ClientRequest {
  requestId?: string;
}

/**
 * Image generation request for a template element
 */
export interface GenerateElementImageRequest extends ClientRequest {
  templateId: string;
  elementId: string;
  appearance: string;
  imageInstructions?: ImageInstructions;
  size?: ImageSize;
  quality?: ImageQuality;
}

/**
 * Response for a successful image generation
 */
export interface GenerateImageResponse {
  imageId: string;
  imagePath: string;
}

/**
 * Standardized response status types for all API requests
 */
export enum ResponseStatus {
  RATE_LIMITED = "rate_limited",
  INVALID = "invalid",
  ERROR = "error",
  SUCCESS = "success",
  CONTENT_MODERATION = "content_moderation",
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
 * Content moderation information returned when a request is moderated
 */
export interface ContentModerationInfo {
  action: ContentModerationAction;
  reason: string;
  prompt: string;
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

/**
 * Content moderation response for content that fails moderation checks
 */
export interface ContentModerationResponse extends BaseServerResponse {
  status: ResponseStatus.CONTENT_MODERATION;
  type: string;
  message: string;
  promptSubmitted: string;
  moderationReason: string;
}
