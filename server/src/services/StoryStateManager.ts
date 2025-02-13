import type { StoryState } from "../../../shared/types/story.js";
import type { PlayerCount, PlayerSlot } from "../../../shared/types/players.js";
import fs from 'fs/promises';
import path from 'path';

export class StoryStateManager {
  private storyStates: Map<string, StoryState> = new Map();
  private codeToStoryMap: Map<string, string> = new Map(); // Maps player codes to story IDs
  private readonly stateDirectory: string;

  constructor() {
    // Remove 'server/' from the path since process.cwd() already points to the server directory
    this.stateDirectory = path.resolve(process.cwd(), 'story_states');
    console.log('[StoryStateManager] Using directory:', this.stateDirectory);
    
    // Create directory synchronously to ensure it exists before any operations
    fs.mkdir(this.stateDirectory, { recursive: true })
      .then(() => console.log('[StoryStateManager] Directory created/verified successfully'))
      .catch(error => console.error('[StoryStateManager] Failed to create directory:', error));
  }

  private getFilePath(storyId: string): string {
    const filePath = path.join(this.stateDirectory, `${storyId}.json`);
    console.log('[StoryStateManager] File path for story:', filePath);
    return filePath;
  }

  async storeState(storyId: string, state: StoryState) {
    try {
      // Update memory cache
      this.storyStates.set(storyId, state);
      
      // Map each player code to this story ID
      Object.entries(state.playerCodes).forEach(([_, code]) => {
        this.codeToStoryMap.set(code, storyId);
      });

      const filePath = this.getFilePath(storyId);
      await fs.writeFile(
        filePath,
        JSON.stringify(state, null, 2),
        'utf-8'
      );
      console.log('[StoryStateManager] Successfully stored state to:', filePath);
    } catch (error) {
      console.error('[StoryStateManager] Failed to store state:', error);
      throw error; // Re-throw to handle in GameHandler
    }
  }

  async getStateByCode(playerCode: string): Promise<StoryState | null> {
    const storyId = this.codeToStoryMap.get(playerCode);
    if (!storyId) return null;

    // Try memory cache first
    const cachedState = this.storyStates.get(storyId);
    if (cachedState) return cachedState;

    // Try loading from file
    try {
      const fileContent = await fs.readFile(this.getFilePath(storyId), 'utf-8');
      const state = JSON.parse(fileContent) as StoryState;
      this.storyStates.set(storyId, state); // Update cache
      return state;
    } catch (error) {
      console.error(`Failed to load story state for ID ${storyId}:`, error);
      return null;
    }
  }

  async updateState(storyId: string, state: StoryState) {
    await this.storeState(storyId, state);
  }
} 