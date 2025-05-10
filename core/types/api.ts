import { RateLimitedAction, ContentModerationAction } from "../config.js";
import { ImageQuality, ImageSize, ImageInstructions } from "./index.js";
import { PublicUser } from "./user.js";
import { GameMode } from "./story.js";

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
 * Image generation request for a template cover
 */
export interface GenerateCoverImageRequest extends ClientRequest {
  templateId: string;
  coverPrompt: string;
  imageInstructions?: ImageInstructions;
  size?: ImageSize;
  quality?: ImageQuality;
}

/**
 * Image generation request for a player identity
 */
export interface GeneratePlayerImageRequest extends ClientRequest {
  templateId: string;
  playerSlot: string;
  identityIndex: number;
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
 * Newsletter subscription request
 */
export interface NewsletterSubscriptionRequest extends ClientRequest {
  email: string;
}

/**
 * Newsletter subscription response
 */
export interface NewsletterSubscriptionResponse {
  message: string;
}

/**
 * User registration request
 */
export interface RegisterUserRequest extends ClientRequest {
  email: string;
  username: string;
  password: string;
}

/**
 * User login request
 */
export interface LoginUserRequest extends ClientRequest {
  email: string;
  password: string;
  rememberMe?: boolean;
}

/**
 * User authentication response
 */
export interface AuthResponse {
  user: PublicUser;
  token: string;
  expiresAt: number;
}

/**
 * Password reset request
 */
export interface PasswordResetRequest extends ClientRequest {
  email: string;
}

/**
 * Password update request
 */
export interface PasswordUpdateRequest extends ClientRequest {
  currentPassword: string;
  newPassword: string;
}

/**
 * User story code association
 */
export interface UserStoryCodeAssociation {
  userId: string;
  storyId: string;
  playerSlot: string;
  code: string;
  createdAt: number;
  lastPlayedAt: number;
}

/**
 * Request to associate a story code with a user
 */
export interface AssociateStoryCodeRequest extends ClientRequest {
  storyId: string;
  playerSlot: string;
  code: string;
}

/**
 * Response containing story codes associated with a user
 */
export interface UserStoryCodesResponse {
  storyCodes: UserStoryCodeAssociation[];
}

/**
 * Basic story metadata
 */
export interface StoryMetadata {
  id: string;
  title: string;
  templateId?: string;
  createdAt: number;
  updatedAt: number;
  maxTurns: number;
  generateImages: boolean;
  creatorId: string;
}

/**
 * Story player entry information
 */
export interface StoryPlayerEntry {
  storyId: string;
  playerSlot: string;
  code: string;
  userId: string | null;
  lastPlayedAt: number | null;
}

/**
 * Extended story metadata that includes player entries
 */
export interface ExtendedStoryMetadata extends StoryMetadata {
  players: StoryPlayerEntry[];
}

/**
 * Response containing stories created by a user
 */
export interface UserStoriesResponse {
  stories: StoryMetadata[] | ExtendedStoryMetadata[];
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

/**
 * Request to create a new story
 */
export interface CreateStoryRequest extends ClientRequest {
  prompt: string;
  generateImages: boolean;
  playerCount: number;
  maxTurns: number;
  gameMode: GameMode;
}

/**
 * Request to create a story from a template
 */
export interface CreateStoryFromTemplateRequest extends ClientRequest {
  templateId: string;
  playerCount: number;
  maxTurns: number;
  generateImages: boolean;
}

/**
 * Response containing story creation status and codes
 */
export interface CreateStoryResponse {
  storyId: string;
  codes: Record<string, string>;
  status: "queued" | "ready";
}
