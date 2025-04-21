import { GameMode, PlayerCount, StoryTemplate } from "./index.js";
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

// AI Generation
export interface GenerateTemplateRequest extends ClientRequest {
  prompt: string;
  playerCount: PlayerCount;
  maxTurns: number;
  gameMode: GameMode;
  generateImages?: boolean;
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

// Template AI Iteration Response
export interface TemplateIterationResponse
  extends SuccessResponse<{ templateUpdate: Partial<StoryTemplate> }> {
  // No additional fields needed
}

// Stories Responses
export interface StoriesListItem {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  players: number;
  status: string;
}

export interface StoriesResponse
  extends SuccessResponse<{ stories: StoriesListItem[] }> {
  // No additional fields needed
}

export interface StoryResponse
  extends SuccessResponse<{ story: Record<string, unknown> }> {
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
  | RateLimitedResponse
  | ErrorResponse;
