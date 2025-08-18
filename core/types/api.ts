import {
  ImageQuality,
  ImageSize,
  ImageInstructions,
  ImageStoryState,
  DifficultyLevel,
} from "./index.js";
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

export interface ImageGenerationErrorInfo {
  errorCode:
    | "CONTENT_POLICY"
    | "COPYRIGHT"
    | "RATE_LIMIT"
    | "TECHNICAL"
    | "UNKNOWN";
  userFriendlyMessage: string;
  technicalMessage: string;
  guidance?: string;
  retryable: boolean;
}

export interface ImageGenerationErrorResponse extends BaseServerResponse {
  status: ResponseStatus.ERROR | ResponseStatus.INVALID;
  errorMessage: string;
  operationType?: string;
  imageGenerationError?: ImageGenerationErrorInfo;
}

/**
 * Story generation
 */
export interface CreateStoryRequest extends ClientRequest {
  prompt: string;
  generateImages: boolean;
  pregenerateBeats?: boolean;
  playerCount: number;
  maxTurns: number;
  gameMode: GameMode;
  difficultyLevel?: DifficultyLevel;
}
export interface CreateStoryFromTemplateRequest extends ClientRequest {
  templateId: string;
  playerCount: number;
  maxTurns: number;
  generateImages: boolean;
  pregenerateBeats?: boolean;
  difficultyLevel: DifficultyLevel;
}
export interface CreateStoryInfo {
  storyId: string;
  codes: Record<string, string>;
  status: "queued" | "ready";
}
export interface CreateStoryResponse extends SuccessResponse<CreateStoryInfo> {}

/**
 * User basics
 */
export interface RegisterUserRequest extends ClientRequest {
  email: string;
  username: string;
  password: string;
}

export interface RegisterUserResponse extends SuccessResponse<PublicUser> {}

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

export interface LoginUserResponse extends SuccessResponse<AuthResponse> {}

export interface GetCurrentUserResponse
  extends SuccessResponse<{ user: PublicUser }> {}

export interface LogoutUserResponse
  extends SuccessResponse<{ message: string }> {}

export interface PasswordResetRequest extends ClientRequest {
  email: string;
}

export interface PasswordUpdateRequest extends ClientRequest {
  currentPassword: string;
  newPassword: string;
}

export interface PasswordUpdateResponse
  extends SuccessResponse<{ message: string }> {}

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
  referenceImageIds?: string[];
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
  // Optional list of up to 2 existing template image IDs to use as references
  referenceImageIds?: string[];
  size?: ImageSize;
  quality?: ImageQuality;
}

/**
 * Template images listing
 */
export interface GetTemplateImagesRequest extends ClientRequest {
  templateId: string;
}

export interface TemplateImageManifest {
  cover: boolean;
  storyElements: Record<string, boolean>; // elementId -> hasImage
  playerIdentities: Record<string, Record<number, boolean>>; // playerSlot -> identityIndex -> hasImage
  totalImages: number;
  missingImages: {
    cover: boolean;
    storyElements: string[]; // missing elementIds
    playerIdentities: Array<{ playerSlot: string; identityIndex: number }>; // missing identities
  };
}

export interface GetTemplateImagesResponse
  extends SuccessResponse<{
    images: ImageStoryState[];
    manifest: TemplateImageManifest;
  }> {}

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
  currentBeat?: number;
  generateImages: boolean;
  creatorId: string | null;
  difficultyLevel: DifficultyLevel;
}

export interface StoryPlayerEntry {
  storyId: string;
  playerSlot: string;
  code?: string;
  userId: string | null;
  lastPlayedAt: number | null;
  isPending?: boolean;
  isCurrentUser?: boolean;
  username?: string;
  status?: "active" | "archived" | "deleted";
}

export interface ExtendedStoryMetadata extends StoryMetadata {
  players: StoryPlayerEntry[];
}

/**
 * New Story Feed Types
 */
export interface GetUserStoryFeedResponse
  extends SuccessResponse<{ stories: ExtendedStoryMetadata[] }> {}

/**
 * Link local story code(s) to authenticated user
 */
export interface LinkStoryToUserRequest extends ClientRequest {
  code: string;
}
export interface LinkStoryToUserResponse
  extends SuccessResponse<{
    success: boolean;
    storyId: string;
    playerSlot: string;
  }> {}

/**
 * Admin specific types
 */
import { AdminStoriesListItem } from "./story.js";

export interface GetAdminStoriesResponseData {
  stories: AdminStoriesListItem[];
}
export interface GetAdminStoriesResponse
  extends SuccessResponse<GetAdminStoriesResponseData> {}

/**
 * Feedback types
 */
export type FeedbackType = "beat" | "general" | "issue" | "suggestion";
export type FeedbackRating = "positive" | "negative" | null;

export interface SubmitFeedbackRequest extends ClientRequest {
  type: FeedbackType;
  rating: FeedbackRating;
  comment: string;
  storyId?: string;
  storyTitle?: string;
  contactInfo?: string;
  storyText?: string;
}

export interface SubmitFeedbackResponse
  extends SuccessResponse<{ feedbackId: string }> {}

/**
 * Admin Feedback types
 */
export interface FeedbackItem {
  id: string;
  type: FeedbackType;
  rating: FeedbackRating;
  comment: string;
  storyId?: string;
  storyTitle?: string;
  contactInfo?: string;
  storyText?: string;
  userId?: string;
  username?: string;
  createdAt: number;
}

export interface GetAdminFeedbackResponse
  extends SuccessResponse<{ feedback: FeedbackItem[] }> {}

export interface DeleteFeedbackRequest extends ClientRequest {
  feedbackId: string;
}

export interface DeleteFeedbackResponse
  extends SuccessResponse<{ success: boolean }> {}

export interface UpdateStoryStatusRequest extends ClientRequest {
  storyId: string;
  playerSlot: string;
  status: "active" | "archived" | "deleted";
}

export interface UpdateStoryStatusResponse
  extends SuccessResponse<{ success: boolean }> {}
