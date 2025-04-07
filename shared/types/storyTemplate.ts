import { GameMode, StorySetup } from "./story.js";
import { PlayerCount } from "./player.js";

// Define the template structure
export interface StoryTemplate {
  id: string;
  gameMode: GameMode;
  playerCount: PlayerCount;
  maxTurns?: number;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  setup: StorySetup<PlayerCount>;
}

// Template list item for displaying in the library
export interface TemplateListItem {
  id: string;
  title: string;
  gameMode: GameMode;
  playerCount: PlayerCount;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}
