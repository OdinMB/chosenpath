import { connectionManager } from "shared/ConnectionManager.js";
import type { StoryState, PlayerSlot } from "core/types/index.js";
import { Story } from "core/models/Story.js";
import { Logger } from "shared/logger.js";
import fs from "fs/promises";
import {
  readStoryFile,
  writeStoryFile,
  listStoryDirectories,
  deleteStoryDirectory,
  getStoryFilePath,
} from "./storageUtils.js";

export class StoryRepository {
  private static instance: StoryRepository;
  private storyStates: Map<string, Story> = new Map();

  private constructor() {}

  public static getInstance(): StoryRepository {
    if (!StoryRepository.instance) {
      StoryRepository.instance = new StoryRepository();
    }
    return StoryRepository.instance;
  }

  async getStory(storyId: string): Promise<Story | null> {
    Logger.StoryRepository.log("Getting state for story:", storyId);

    // Check memory cache first
    const cachedStory = this.storyStates.get(storyId);
    if (cachedStory) {
      Logger.StoryRepository.log("Found state in memory cache");
      // Return a fresh copy by cloning the story with its current state
      return new Story(JSON.parse(JSON.stringify(cachedStory.getState())));
    }

    Logger.StoryRepository.log("State not in cache, loading from file...");

    // If not in memory, try loading from file
    try {
      const data = await readStoryFile(storyId);
      const state = JSON.parse(data) as StoryState;

      Logger.StoryRepository.log("Successfully loaded state from file");

      // Create a Story instance
      const story = new Story(state);

      // Cache in memory
      this.storyStates.set(storyId, story);
      Logger.StoryRepository.log("Cached state in memory");

      // Return a fresh copy
      return new Story(JSON.parse(JSON.stringify(state)));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        Logger.StoryRepository.log("Story file not found:", storyId);
      } else {
        Logger.StoryRepository.error("Failed to load state:", error);
      }
      return null;
    }
  }

  async storeStory(storyId: string, story: Story): Promise<void> {
    Logger.StoryRepository.log("Storing state for story:", storyId);

    // Get the state from the story
    const state = story.getState();

    // Create a fresh copy for both cache and file
    const stateCopy = JSON.parse(JSON.stringify(state));
    const storyCopy = new Story(stateCopy);

    // Update memory cache
    this.storyStates.set(storyId, storyCopy);

    // Write to file using the new utility function
    await writeStoryFile(storyId, JSON.stringify(state, null, 2));
  }

  async deleteStory(storyId: string): Promise<void> {
    try {
      // Remove from memory cache
      this.storyStates.delete(storyId);

      // Remove directory using the utility function
      await deleteStoryDirectory(storyId);

      Logger.StoryRepository.log("Successfully deleted state:", storyId);
    } catch (error) {
      Logger.StoryRepository.error("Failed to delete state:", error);
      throw error;
    }
  }

  // Helper method to clean up completed or abandoned stories
  async cleanupStories(): Promise<void> {
    try {
      const storyIds = await listStoryDirectories();

      for (const storyId of storyIds) {
        const activePlayers = connectionManager.getActivePlayersInGame(storyId);

        // If no active players and story is old, delete it
        if (activePlayers.length === 0) {
          try {
            const filePath = getStoryFilePath(storyId);
            const stats = await fs.stat(filePath);
            const ageInHours =
              (Date.now() - Number(stats.mtimeMs)) / (1000 * 60 * 60);

            if (ageInHours > 120) {
              // Delete stories older than 72 hours
              await this.deleteStory(storyId);
            }
          } catch (statError) {
            // Skip if we can't get stats (file might not exist)
            Logger.StoryRepository.error(
              `Error getting stats for story ${storyId}:`,
              statError
            );
          }
        }
      }
    } catch (error) {
      Logger.StoryRepository.error("Failed to cleanup states:", error);
    }
  }

  async getActiveStories(): Promise<
    Array<{ storyId: string; playerCount: number }>
  > {
    const result: Array<{ storyId: string; playerCount: number }> = [];

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

  getAllStories(): Array<{ storyId: string; story: Story }> {
    return Array.from(this.storyStates.entries()).map(([storyId, story]) => ({
      storyId,
      story,
    }));
  }

  // This method is being removed as ConnectionManager will handle code lookups via DB.
  // async findStoryByCode(
  //   code: string
  // ): Promise<{ storyId: string; story: Story } | null> {
  //   Logger.StoryRepository.log("Searching for state with code:", code);
  //   // ... old implementation ...
  //   return null;
  // }
}

// Export singleton instance
export const storyRepository = StoryRepository.getInstance();
