import { promises as fs } from "fs";
import path from "path";
import { connectionManager } from "./ConnectionManager.js";
import type { StoryState } from "shared/types/story.js";
import { Story } from "./Story.js";
import type { PlayerSlot } from "shared/types/player.js";

export class StoryRepository {
  private static instance: StoryRepository;
  private storyStates: Map<string, Story> = new Map();
  private storageDir: string;

  private constructor() {
    this.storageDir = path.join(process.cwd(), "data", "stories");
    this.ensureStorageDir();
  }

  public static getInstance(): StoryRepository {
    if (!StoryRepository.instance) {
      StoryRepository.instance = new StoryRepository();
    }
    return StoryRepository.instance;
  }

  private async ensureStorageDir() {
    try {
      await fs.mkdir(this.storageDir, { recursive: true });
    } catch (error) {
      console.error(
        "[StoryRepository] Failed to create storage directory:",
        error
      );
    }
  }

  private getFilePath(storyId: string): string {
    return path.join(this.storageDir, `${storyId}.json`);
  }

  async getStory(storyId: string): Promise<Story | null> {
    console.log("[StoryRepository] Getting state for story:", storyId);

    // Check memory cache first
    const cachedStory = this.storyStates.get(storyId);
    if (cachedStory) {
      console.log("[StoryRepository] Found state in memory cache");
      // Return a fresh copy by cloning the story with its current state
      return new Story(JSON.parse(JSON.stringify(cachedStory.getState())));
    }

    console.log("[StoryRepository] State not in cache, loading from file...");

    // If not in memory, try loading from file
    try {
      const filePath = this.getFilePath(storyId);
      console.log("[StoryRepository] Reading from:", filePath);

      const data = await fs.readFile(filePath, "utf-8");
      const state = JSON.parse(data) as StoryState;

      console.log("[StoryRepository] Successfully loaded state from file");

      // Create a Story instance
      const story = new Story(state);

      // Cache in memory
      this.storyStates.set(storyId, story);
      console.log("[StoryRepository] Cached state in memory");

      // Register codes with ConnectionManager if they're not already registered
      const stateData = story.getState();
      if (stateData.playerCodes) {
        console.log("[StoryRepository] Registering player codes...");
        Object.entries(stateData.playerCodes).forEach(([slot, code]) => {
          if (!connectionManager.hasCode(code as string)) {
            console.log("[StoryRepository] Registering new code:", {
              slot,
              code,
            });
            connectionManager.registerCode(
              storyId,
              slot as PlayerSlot,
              code as string
            );
          } else {
            console.log("[StoryRepository] Code already registered:", {
              slot,
              code,
            });
          }
        });
      }

      // Return a fresh copy
      return new Story(JSON.parse(JSON.stringify(state)));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        console.log("[StoryRepository] Story file not found:", storyId);
      } else {
        console.error("[StoryRepository] Failed to load state:", error);
      }
      return null;
    }
  }

  async storeStory(storyId: string, story: Story): Promise<void> {
    console.log("[StoryRepository] Storing state for story:", storyId);

    // Get the state from the story
    const state = story.getState();

    // Create a fresh copy for both cache and file
    const stateCopy = JSON.parse(JSON.stringify(state));
    const storyCopy = new Story(stateCopy);

    // Update memory cache
    this.storyStates.set(storyId, storyCopy);

    // Write to file
    const filePath = this.getFilePath(storyId);
    await fs.writeFile(filePath, JSON.stringify(state, null, 2));
  }

  async deleteStory(storyId: string): Promise<void> {
    try {
      // Remove from memory cache
      this.storyStates.delete(storyId);

      // Remove file
      const filePath = this.getFilePath(storyId);
      await fs.unlink(filePath);

      console.log("[StoryRepository] Successfully deleted state:", storyId);
    } catch (error) {
      console.error("[StoryRepository] Failed to delete state:", error);
      throw error;
    }
  }

  // Helper method to clean up completed or abandoned stories
  async cleanupStories(): Promise<void> {
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
            await this.deleteStory(storyId);
          }
        }
      }
    } catch (error) {
      console.error("[StoryRepository] Failed to cleanup states:", error);
    }
  }

  // Get all active stories (useful for monitoring/debugging)
  async getActiveStories(): Promise<
    Array<{ storyId: string; playerCount: number }>
  > {
    const result = [];

    for (const [storyId, story] of this.storyStates) {
      const activePlayers = connectionManager.getActivePlayersInGame(storyId);
      if (activePlayers.length > 0) {
        const state = story.getState();
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
      console.log("[StoryRepository] Loading existing stories...");

      for (const file of files) {
        if (!file.endsWith(".json")) continue;

        const storyId = path.parse(file).name;
        try {
          const data = await fs.readFile(
            path.join(this.storageDir, file),
            "utf-8"
          );
          const state = JSON.parse(data) as StoryState;
          const story = new Story(state);
          this.storyStates.set(storyId, story);
          console.log("[StoryRepository] Loaded story:", storyId);
        } catch (error) {
          console.error(
            `[StoryRepository] Failed to load story ${storyId}:`,
            error
          );
        }
      }

      console.log("[StoryRepository] Finished loading stories");
      return;
    } catch (error) {
      console.error(
        "[StoryRepository] Failed to load existing stories:",
        error
      );
    }
  }

  // Add method to get all loaded stories
  getAllStories(): Array<{ storyId: string; story: Story }> {
    return Array.from(this.storyStates.entries()).map(([storyId, story]) => ({
      storyId,
      story,
    }));
  }

  async findStoryByCode(
    code: string
  ): Promise<{ storyId: string; story: Story } | null> {
    console.log("[StoryRepository] Searching for state with code:", code);

    try {
      const files = await fs.readdir(this.storageDir);
      console.log(
        "[StoryRepository] Searching through ",
        files.length,
        " story files"
      );

      for (const file of files) {
        if (!file.endsWith(".json")) continue;

        const storyId = path.parse(file).name;
        const filePath = path.join(this.storageDir, file);
        const data = await fs.readFile(filePath, "utf-8");
        const state = JSON.parse(data) as StoryState;
        const story = new Story(state);

        // Check if this state contains the code
        const stateData = story.getState();
        if (
          stateData.playerCodes &&
          Object.values(stateData.playerCodes).some((c) => c === code)
        ) {
          console.log("[StoryRepository] Found code in story:", storyId);

          // Cache the found state
          this.storyStates.set(storyId, story);
          console.log("[StoryRepository] Cached found state in memory");

          return { storyId, story };
        }
      }

      console.log("[StoryRepository] Code not found in any story");
      return null;
    } catch (error) {
      console.error("[StoryRepository] Failed to find state by code:", error);
      return null;
    }
  }
}

// Export singleton instance
export const storyRepository = StoryRepository.getInstance();
