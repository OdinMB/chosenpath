import { ImageQuality, ImageSize, ImageInstructions } from "./index.js";
import { PublicUser } from "./user.js";
import { GameMode } from "./story.js";

/*
 * Bases
 */
export interface ClientRequest {
  requestId?: string;
}
export enum ResponseStatus {
  SUCCESS = "success",
  INVALID = "invalid",
  ERROR = "error",
  RATE_LIMITED = "rate_limited",
  MODERATION_BLOCKED = "moderation_blocked",
}
export interface BaseServerResponse {
  requestId: string;
  status: ResponseStatus;
  timestamp: number;
}
export interface SuccessResponse<T = unknown> extends BaseServerResponse {
  status: ResponseStatus.SUCCESS;
  data: T;
}

/**
 * Errors and Issues
 */
export interface ErrorResponse extends BaseServerResponse {
  status: ResponseStatus.ERROR | ResponseStatus.INVALID;
  errorMessage: string;
  operationType?: string;
}

export interface RateLimitInfo {
  isLimited: boolean;
  timeRemaining: number;
  maxRequests?: number;
  windowMs?: number;
  requestsRemaining: number;
}
export interface ContentModerationInfo {
  reason: string;
  prompt: string;
}
export interface ModerationBlockedResponse extends BaseServerResponse {
  status: ResponseStatus.MODERATION_BLOCKED;
  moderation: ContentModerationInfo;
}
export interface RateLimitedResponse extends BaseServerResponse {
  status: ResponseStatus.RATE_LIMITED;
  rateLimit: RateLimitInfo;
}

/**
 * Story generation
 */
export interface CreateStoryRequest extends ClientRequest {
  prompt: string;
  generateImages: boolean;
  playerCount: number;
  maxTurns: number;
  gameMode: GameMode;
}
export interface CreateStoryFromTemplateRequest extends ClientRequest {
  templateId: string;
  playerCount: number;
  maxTurns: number;
  generateImages: boolean;
}
export interface CreateStoryResponse
  extends SuccessResponse<{
    storyId: string;
    codes: Record<string, string>;
    status: "queued" | "ready";
  }> {}

/**
 * User basics
 */
export interface RegisterUserRequest extends ClientRequest {
  email: string;
  username: string;
  password: string;
}
export interface LoginUserRequest extends ClientRequest {
  email: string;
  password: string;
  rememberMe?: boolean;
}
export interface AuthResponse {
  user: PublicUser;
  token: string;
  expiresAt: number;
}
export interface PasswordResetRequest extends ClientRequest {
  email: string;
}
export interface PasswordUpdateRequest extends ClientRequest {
  currentPassword: string;
  newPassword: string;
}

/**
 * Newsletter
 */
export interface NewsletterSubscriptionRequest extends ClientRequest {
  email: string;
}
export interface NewsletterSubscriptionResponse {
  message: string;
}

/**
 * Image requests
 */
export interface GenerateCoverImageRequest extends ClientRequest {
  templateId: string;
  coverPrompt: string;
  imageInstructions?: ImageInstructions;
  size?: ImageSize;
  quality?: ImageQuality;
}
export interface GeneratePlayerImageRequest extends ClientRequest {
  templateId: string;
  playerSlot: string;
  identityIndex: number;
  appearance: string;
  imageInstructions?: ImageInstructions;
  size?: ImageSize;
  quality?: ImageQuality;
}
export interface GenerateImageResponse {
  imageId: string;
  imagePath: string;
}
export interface GenerateElementImageRequest extends ClientRequest {
  templateId: string;
  elementId: string;
  appearance: string;
  imageInstructions?: ImageInstructions;
  size?: ImageSize;
  quality?: ImageQuality;
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
export interface AssociateStoryCodeRequest extends ClientRequest {
  storyId: string;
  playerSlot: string;
  code: string;
}
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
export interface StoryPlayerEntry {
  storyId: string;
  playerSlot: string;
  code: string;
  userId: string | null;
  lastPlayedAt: number | null;
}
export interface ExtendedStoryMetadata extends StoryMetadata {
  players: StoryPlayerEntry[];
}
export interface UserStoriesResponse {
  stories: StoryMetadata[] | ExtendedStoryMetadata[];
}
