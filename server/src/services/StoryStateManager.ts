import { promises as fs } from "fs";
import path from "path";
import { connectionManager } from "./ConnectionManager.js";
import type { StoryState } from "shared/types/story.js";
import type { PlayerSlot } from "shared/types/player.js";

export class StoryStateManager {
  private static instance: StoryStateManager;
  private storyStates: Map<string, StoryState> = new Map();
  private storageDir: string;

  private constructor() {
    this.storageDir = path.join(process.cwd(), "data", "stories");
    this.ensureStorageDir();
  }

  public static getInstance(): StoryStateManager {
    if (!StoryStateManager.instance) {
      StoryStateManager.instance = new StoryStateManager();
    }
    return StoryStateManager.instance;
  }

  private async ensureStorageDir() {
    try {
      await fs.mkdir(this.storageDir, { recursive: true });
    } catch (error) {
      console.error(
        "[StoryStateManager] Failed to create storage directory:",
        error
      );
    }
  }

  private getFilePath(storyId: string): string {
    return path.join(this.storageDir, `${storyId}.json`);
  }

  async getState(storyId: string): Promise<StoryState | null> {
    console.log("[StoryStateManager] Getting state for story:", storyId);

    // Check memory cache first
    const cachedState = this.storyStates.get(storyId);
    if (cachedState) {
      console.log("[StoryStateManager] Found state in memory cache");
      return JSON.parse(JSON.stringify(cachedState));
    }

    console.log("[StoryStateManager] State not in cache, loading from file...");

    // If not in memory, try loading from file
    try {
      const filePath = this.getFilePath(storyId);
      console.log("[StoryStateManager] Reading from:", filePath);

      const data = await fs.readFile(filePath, "utf-8");
      const state = JSON.parse(data) as StoryState;

      console.log("[StoryStateManager] Successfully loaded state from file");

      // Cache in memory
      this.storyStates.set(storyId, state);
      console.log("[StoryStateManager] Cached state in memory");

      // Register codes with ConnectionManager if they're not already registered
      if (state.playerCodes) {
        console.log("[StoryStateManager] Registering player codes...");
        Object.entries(state.playerCodes).forEach(([slot, code]) => {
          if (!connectionManager.hasCode(code)) {
            console.log("[StoryStateManager] Registering new code:", {
              slot,
              code,
            });
            connectionManager.registerCode(storyId, slot as PlayerSlot, code);
          } else {
            console.log("[StoryStateManager] Code already registered:", {
              slot,
              code,
            });
          }
        });
      }

      // Return a fresh copy
      return JSON.parse(JSON.stringify(state));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        console.log("[StoryStateManager] Story file not found:", storyId);
      } else {
        console.error("[StoryStateManager] Failed to load state:", error);
      }
      return null;
    }
  }

  async storeState(storyId: string, newState: StoryState): Promise<void> {
    console.log("[StoryStateManager] Storing state for story:", storyId);

    // Create a fresh copy for both cache and file
    const stateCopy = JSON.parse(JSON.stringify(newState));

    // Update memory cache
    this.storyStates.set(storyId, stateCopy);

    // Write to file
    const filePath = this.getFilePath(storyId);
    await fs.writeFile(filePath, JSON.stringify(newState, null, 2));
  }

  async deleteState(storyId: string): Promise<void> {
    try {
      // Remove from memory cache
      this.storyStates.delete(storyId);

      // Remove file
      const filePath = this.getFilePath(storyId);
      await fs.unlink(filePath);

      console.log("[StoryStateManager] Successfully deleted state:", storyId);
    } catch (error) {
      console.error("[StoryStateManager] Failed to delete state:", error);
      throw error;
    }
  }

  // Helper method to clean up completed or abandoned stories
  async cleanupStates(): Promise<void> {
    try {
      const files = await fs.readdir(this.storageDir);

      for (const file of files) {
        const storyId = path.parse(file).name;
        const activePlayers = connectionManager.getActivePlayersInGame(storyId);

        // If no active players and story is old, delete it
        if (activePlayers.length === 0) {
          const filePath = this.getFilePath(storyId);
          const stats = await fs.stat(filePath);
          const ageInHours = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60);

          if (ageInHours > 24) {
            // Delete stories older than 24 hours
            await this.deleteState(storyId);
          }
        }
      }
    } catch (error) {
      console.error("[StoryStateManager] Failed to cleanup states:", error);
    }
  }

  // Get all active stories (useful for monitoring/debugging)
  async getActiveStories(): Promise<
    Array<{ storyId: string; playerCount: number }>
  > {
    const result = [];

    for (const [storyId, state] of this.storyStates) {
      const activePlayers = connectionManager.getActivePlayersInGame(storyId);
      if (activePlayers.length > 0) {
        result.push({
          storyId,
          playerCount: Object.keys(state.players).length,
        });
      }
    }

    return result;
  }

  // Add this method to load all existing stories on startup
  async loadExistingStories(): Promise<void> {
    try {
      const files = await fs.readdir(this.storageDir);
      console.log("[StoryStateManager] Loading existing stories...");

      for (const file of files) {
        if (!file.endsWith(".json")) continue;

        const storyId = path.parse(file).name;
        try {
          const data = await fs.readFile(
            path.join(this.storageDir, file),
            "utf-8"
          );
          const state = JSON.parse(data) as StoryState;
          this.storyStates.set(storyId, state);
          console.log("[StoryStateManager] Loaded story:", storyId);
        } catch (error) {
          console.error(
            `[StoryStateManager] Failed to load story ${storyId}:`,
            error
          );
        }
      }

      console.log("[StoryStateManager] Finished loading stories");
      return;
    } catch (error) {
      console.error(
        "[StoryStateManager] Failed to load existing stories:",
        error
      );
    }
  }

  // Add method to get all loaded stories
  getAllStories(): Array<{ storyId: string; state: StoryState }> {
    return Array.from(this.storyStates.entries()).map(([storyId, state]) => ({
      storyId,
      state,
    }));
  }

  async findStateByCode(
    code: string
  ): Promise<{ storyId: string; state: StoryState } | null> {
    console.log("[StoryStateManager] Searching for state with code:", code);

    try {
      const files = await fs.readdir(this.storageDir);
      console.log(
        "[StoryStateManager] Searching through ",
        files.length,
        " story files"
      );

      for (const file of files) {
        if (!file.endsWith(".json")) continue;

        const storyId = path.parse(file).name;
        const filePath = path.join(this.storageDir, file);
        const data = await fs.readFile(filePath, "utf-8");
        const state = JSON.parse(data) as StoryState;

        // Check if this state contains the code
        if (
          state.playerCodes &&
          Object.values(state.playerCodes).includes(code)
        ) {
          console.log("[StoryStateManager] Found code in story:", storyId);

          // Cache the found state
          this.storyStates.set(storyId, state);
          console.log("[StoryStateManager] Cached found state in memory");

          return { storyId, state };
        }
      }

      console.log("[StoryStateManager] Code not found in any story files");
      return null;
    } catch (error) {
      console.error("[StoryStateManager] Error searching for code:", error);
      return null;
    }
  }
}

// Export singleton instance
export const storyStateManager = StoryStateManager.getInstance();
