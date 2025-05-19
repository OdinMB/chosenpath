import {
  GameMode,
  PlayerCount,
  StoryTemplate,
  DifficultyLevel,
} from "./index.js";
import {
  ClientRequest,
  RateLimitedResponse,
  SuccessResponse,
  ErrorResponse,
} from "./api.js";
import { templateIterationSections } from "../utils/templateIterationSections.js";

// ===============================================
// Common types
// ===============================================

export type TemplateIterationSections = keyof typeof templateIterationSections;

// ===============================================
// Request Types
// ===============================================

// Template Fetch
export interface GetTemplatesRequest extends ClientRequest {
  forWelcomeScreen?: boolean;
}

export interface GetTemplateByIdRequest extends ClientRequest {
  id: string;
}

// Template Creation/Update
export interface CreateTemplateRequest extends ClientRequest {
  template: Partial<StoryTemplate>;
}

export interface UpdateTemplateRequest extends CreateTemplateRequest {
  id: string;
}

export interface DeleteTemplateRequest extends ClientRequest {
  id: string;
}

// Template Assets
export interface ExportTemplateAssetsRequest extends ClientRequest {
  id: string;
}

export interface ExportAllTemplatesAssetsRequest extends ClientRequest {
  // No additional fields needed
}

export interface UploadTemplateFileRequest extends ClientRequest {
  id: string;
  file: File;
  subdir?: string;
}

export interface ImportTemplateFilesRequest extends ClientRequest {
  id: string;
  zipFile: File;
}

// AI Generation
export interface GenerateTemplateRequest extends ClientRequest {
  prompt: string;
  playerCount: PlayerCount;
  maxTurns: number;
  gameMode: GameMode;
  generateImages?: boolean;
  difficultyLevel: DifficultyLevel;
}

export interface TemplateIterationRequest extends ClientRequest {
  templateId: string;
  feedback: string;
  sections: TemplateIterationSections[];
  gameMode: GameMode;
  playerCount: PlayerCount;
  maxTurns: number;
}

// Story Management
export interface GetStoriesRequest extends ClientRequest {
  // Optional filters could be added here
}

export interface GetStoryByIdRequest extends ClientRequest {
  id: string;
}

export interface DeleteStoryRequest extends ClientRequest {
  id: string;
}

// User Management
export interface GetUsersRequest extends ClientRequest {
  // Optional filters could be added here
}

export interface DeleteUserRequest extends ClientRequest {
  id: string;
}

// ===============================================
// Response Types
// ===============================================

// Template Responses
export interface TemplatesResponse
  extends SuccessResponse<{ templates: StoryTemplate[] }> {
  // No additional fields needed
}

export interface TemplateResponse
  extends SuccessResponse<{ template: StoryTemplate }> {
  // No additional fields needed
}

export interface DeleteResponse extends SuccessResponse<{ success: boolean }> {
  // No additional fields needed
}

// Template Assets Responses
export interface UploadFileResponse
  extends SuccessResponse<{
    success: boolean;
    path: string;
  }> {
  // No additional fields needed
}

export interface ImportFilesResponse
  extends SuccessResponse<{
    success: boolean;
    filesImported: number;
    files: string[];
  }> {
  // No additional fields needed
}

// Template AI Iteration Response
export interface TemplateIterationResponse
  extends SuccessResponse<{ templateUpdate: Partial<StoryTemplate> }> {
  // No additional fields needed
}

// Stories Responses
export interface StoriesListItem {
  id: string;
  title: string;
  createdAt: string | null;
  updatedAt: string;
  gameMode: string;
  playerCount: number;
  characterSelectionCompleted: boolean;
  maxTurns: number;
  currentBeat: number;
  templateId?: string;
  error?: string;
}

export interface StoriesResponse
  extends SuccessResponse<{ stories: StoriesListItem[] }> {
  // No additional fields needed
}

export interface StoryResponse
  extends SuccessResponse<{ story: Record<string, unknown> }> {
  // No additional fields needed
}

// User Responses
export interface UserListItem {
  id: string;
  username: string;
  email: string;
  roleId: string;
  createdAt: number;
  lastLoginAt: number | null;
}

export interface UsersResponse
  extends SuccessResponse<{ users: UserListItem[] }> {
  // No additional fields needed
}

// Union type for all possible admin responses
export type AdminResponse =
  | TemplatesResponse
  | TemplateResponse
  | DeleteResponse
  | TemplateIterationResponse
  | StoriesResponse
  | StoryResponse
  | UploadFileResponse
  | ImportFilesResponse
  | UsersResponse
  | RateLimitedResponse
  | ErrorResponse;
