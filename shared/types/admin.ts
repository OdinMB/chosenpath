import {
  GameMode,
  PlayerCount,
  StoryTemplate,
  PublicationStatus,
  Guidelines,
  Outcome,
  StoryElement,
  Stat,
  StatValueEntry,
  PlayerOptionsGeneration,
  CharacterSelectionIntroduction,
  PlayerSlot,
} from "./index.js";
import {
  ClientRequest,
  RateLimitedResponse,
  SuccessResponse,
  ErrorResponse,
} from "./api.js";

// ===============================================
// Common types
// ===============================================

export interface SectionData {
  guidelines?: Guidelines;
  storyElements?: StoryElement[];
  sharedOutcomes?: Outcome[];
  statGroups?: string[];
  sharedStats?: Stat[];
  playerStats?: Stat[];
  initialSharedStatValues?: StatValueEntry[];
  playerOptions?: Record<PlayerSlot, PlayerOptionsGeneration>;
  characterSelectionIntroduction?: CharacterSelectionIntroduction;
  stats?: {
    statGroups?: string[];
    sharedStats?: Stat[];
    playerStats?: Stat[];
    initialSharedStatValues?: StatValueEntry[];
  };
  players?: {
    playerOptions?: Record<PlayerSlot, PlayerOptionsGeneration>;
    characterSelectionIntroduction?: CharacterSelectionIntroduction;
  };
}

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
  playerCountMin: PlayerCount;
  playerCountMax: PlayerCount;
  gameMode: GameMode;
  maxTurnsMin?: number;
  maxTurnsMax?: number;
  title: string;
  teaser?: string;
  publicationStatus?: PublicationStatus;
  showOnWelcomeScreen?: boolean;
  order?: number;
  tags?: string[];
  guidelines?: Guidelines;
  storyElements?: StoryElement[];
  sharedOutcomes?: Outcome[];
  statGroups?: string[];
  sharedStats?: Stat[];
  playerStats?: Stat[];
  initialSharedStatValues?: StatValueEntry[];
  characterSelectionIntroduction?: CharacterSelectionIntroduction;
  // Plus player options for each player slot
  [key: `player${number}`]: PlayerOptionsGeneration;
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
  sections: Array<keyof SectionData>;
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
  extends SuccessResponse<{ templateUpdate: SectionData }> {
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
