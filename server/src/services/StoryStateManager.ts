import type { StoryState } from "../../../shared/types/story.js";
import type { PlayerCount, PlayerSlot } from "../../../shared/types/players.js";

export class StoryStateManager {
  private storyStates: Map<string, StoryState> = new Map();
  private codeToStoryMap: Map<string, string> = new Map(); // Maps player codes to story IDs

  storeState(storyId: string, state: StoryState) {
    this.storyStates.set(storyId, state);
    
    // Map each player code to this story ID
    Object.entries(state.playerCodes).forEach(([_, code]) => {
      this.codeToStoryMap.set(code, storyId);
    });
  }

  getStateByCode(playerCode: string): StoryState | null {
    const storyId = this.codeToStoryMap.get(playerCode);
    if (!storyId) return null;
    return this.storyStates.get(storyId) || null;
  }

  updateState(storyId: string, state: StoryState) {
    this.storyStates.set(storyId, state);
  }
} 