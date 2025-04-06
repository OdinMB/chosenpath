import { GameMode, StorySetup } from "./story.js";
import { PlayerCount } from "./player.js";

// Define the template structure
export interface StoryTemplate {
  id: string;
  title: string;
  gameMode: GameMode;
  playerCount: PlayerCount;
  createdAt: string;
  updatedAt: string;
  setup: StorySetup<PlayerCount>;
}

// Template form data for creating/updating
export interface TemplateFormData {
  title: string;
  gameMode: GameMode;
  playerCount: PlayerCount;
  setup: Partial<StorySetup<PlayerCount>>;
}

// Template list item for displaying in the library
export interface TemplateListItem {
  id: string;
  title: string;
  gameMode: GameMode;
  playerCount: PlayerCount;
  createdAt: string;
  updatedAt: string;
}
