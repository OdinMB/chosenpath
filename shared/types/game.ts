import { StoryState } from "./story.js";

export interface GameState {
  id: string;
  players: Player[];
  currentTurn: number;
  maxTurns: number;
  status: "waiting" | "in_progress" | "completed";
  storyState: StoryState;
}

export interface Player {
  id: string;
  name: string;
  ready: boolean;
  connected: boolean;
}
