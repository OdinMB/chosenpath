import {
  ImageQuality,
  ImageSize,
  ImageInstructions,
  ImageStoryState,
  DifficultyLevel,
} from "./index.js";
import { PublicUser } from "./user.js";
import { GameMode, KidAges, StoryCategory } from "./story.js";

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

/**
 * The errorMessage of the server's 403 when a request's X-CSRF-TOKEN header
 * doesn't match its XSRF-TOKEN cookie. The client recognises it to retry once
 * with a refreshed token.
 */
export const CSRF_FAILURE_MESSAGE = "Invalid CSRF token";

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
  /** The setup category; read-with-kids stories get stricter image moderation. */
  category?: StoryCategory;
  /** A read-with-kids story: the children's ages, one age or a range (the read-with-kids setting). */
  kidAges?: KidAges;
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

/** A story's setup: queued while it is generated, ready once stored, failed for good. */
export type StoryCreationStatus = "queued" | "ready" | "failed";
/**
 * Why a setup failed for good: its generation failed after the retries
 * ("setup_failed"), or this server is neither setting it up nor holds it,
 * e.g. it restarted mid-setup ("setup_lost").
 */
export type StorySetupFailureReason = "setup_failed" | "setup_lost";
export interface StoryStatusInfo {
  status: StoryCreationStatus;
  /** Set when the status is "failed". */
  reason?: StorySetupFailureReason;
}
export interface CheckStoryStatusResponse
  extends SuccessResponse<StoryStatusInfo> {}

/** GET /stories/:code/exists: whether a seat code names a story (never which one). */
export interface CodeExistsInfo {
  exists: boolean;
}
export interface CodeExistsResponse extends SuccessResponse<CodeExistsInfo> {}

/**
 * The 503's errorMessage when a story start is refused because today's AI
 * spend ceiling for its kind of story is reached (server/src/spend/).
 */
export const SPEND_CEILING_MESSAGE =
  "New stories are paused until tomorrow: today's budget is used up. Stories already running continue, without new images.";

/**
 * Admin "System" page
 */

/**
 * GET /admin/system/connection: how the server sees the caller's own request,
 * for setting TRUST_PROXY (the number of proxies in front of the app).
 */
export interface ConnectionReport {
  /** The address the per-address limits count by; null when it can't be read */
  address: string | null;
  /** The configured hop count; null when TRUST_PROXY is not set */
  trustProxy: number | null;
  /** The socket's address: the nearest proxy, or the caller when there is none */
  connectionAddress: string | null;
  /** The X-Forwarded-For chain as sent, left to right */
  forwardedFor: string[];
  /** For each hop count from 0 to the chain's length, the address it would give */
  candidates: { hops: number; address: string | null }[];
  host: string | null;
  protocol: string;
}

/**
 * GET /admin/system/addresses: how many of the limits' address reads found no
 * client address. They all share one bucket; most of them means TRUST_PROXY
 * is set higher than the real proxy chain.
 */
export interface UnreadableAddressCounts {
  /** `since`: when the server process started, in ms since the epoch */
  sinceStart: { unreadable: number; total: number; since: number };
  lastHour: { unreadable: number; total: number };
}

/** Who an AI call's cost is booked to: stories without an account, with one, or neither (editor, filter). */
export type SpendBucket = "anonymous" | "account" | "other";
export const SPEND_BUCKETS: readonly SpendBucket[] = [
  "anonymous",
  "account",
  "other",
];

export interface SpendBucketTotal {
  usd: number;
  textCalls: number;
  imageCalls: number;
}

/** GET /admin/system/spend: today's and this month's AI spend per bucket (UTC days). */
export interface SpendTotals {
  /** Today, UTC, as YYYY-MM-DD */
  today: string;
  /** The first day of this month, UTC, as YYYY-MM-DD */
  monthStart: string;
  buckets: Record<
    SpendBucket,
    {
      today: SpendBucketTotal;
      month: SpendBucketTotal;
      /** US$ a day; null when no ceiling is set (recording only) */
      ceilingUsdPerDay: number | null;
    }
  >;
}

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
 * Template image management
 */
export interface RenameTemplateImageRequest extends ClientRequest {
  templateId: string;
  oldElementId: string;
  newElementId: string;
}

export interface DeleteTemplateImageRequest extends ClientRequest {
  templateId: string;
  elementId: string;
}

export interface ImageOperationResponse extends SuccessResponse<{
  success: boolean;
  message?: string;
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
