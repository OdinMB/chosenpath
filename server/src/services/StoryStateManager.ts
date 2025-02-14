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

  async getStateByCode(playerCode: string): Promise<{ state: StoryState | null; storyId: string | null }> {
    // First try memory cache via the code-to-story map
    const storyId = this.codeToStoryMap.get(playerCode);
    if (storyId) {
      // Try memory cache first
      const cachedState = this.storyStates.get(storyId);
      if (cachedState) return { state: cachedState, storyId };

      // Try loading specific file if we know the ID
      try {
        const fileContent = await fs.readFile(this.getFilePath(storyId), 'utf-8');
        const state = JSON.parse(fileContent) as StoryState;
        this.storyStates.set(storyId, state); // Update cache
        this.codeToStoryMap.set(playerCode, storyId); // Ensure code mapping
        return { state, storyId };
      } catch (error) {
        console.error(`Failed to load story state for ID ${storyId}:`, error);
      }
    }

    // If not found in memory, search through all files
    try {
      const files = await fs.readdir(this.stateDirectory);
      
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        
        try {
          const filePath = path.join(this.stateDirectory, file);
          const content = await fs.readFile(filePath, 'utf-8');
          const state = JSON.parse(content) as StoryState;
          
          // Check if this state contains the player code
          const hasCode = Object.values(state.playerCodes).includes(playerCode);
          if (hasCode) {
            // Update our caches
            const foundStoryId = path.basename(file, '.json');
            this.storyStates.set(foundStoryId, state);
            this.codeToStoryMap.set(playerCode, foundStoryId);
            return { state, storyId: foundStoryId };
          }
        } catch (error) {
          console.error(`Error reading file ${file}:`, error);
          continue; // Skip problematic files
        }
      }
      
      // Code not found in any file
      return { state: null, storyId: null };
    } catch (error) {
      console.error('Failed to read story states directory:', error);
      return { state: null, storyId: null };
    }
  }

  async updateState(storyId: string, state: StoryState) {
    await this.storeState(storyId, state);
  }
} 