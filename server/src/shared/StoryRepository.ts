import path from "path";
import { connectionManager } from "common/ConnectionManager.js";
import type { StoryState, PlayerSlot } from "core/types/index.js";
import { Story } from "core/models/Story.js";
import { Logger } from "common/logger.js";
import {
  readStorageFile,
  writeStorageFile,
  listStorageFiles,
  deleteStorageFile,
  getStorageFileStats,
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
      const data = await readStorageFile("stories", `${storyId}.json`);
      const state = JSON.parse(data) as StoryState;

      Logger.StoryRepository.log("Successfully loaded state from file");

      // Create a Story instance
      const story = new Story(state);

      // Cache in memory
      this.storyStates.set(storyId, story);
      Logger.StoryRepository.log("Cached state in memory");

      // Register codes with ConnectionManager if they're not already registered
      const stateData = story.getState();
      if (stateData.playerCodes) {
        Logger.StoryRepository.log("Registering player codes...");
        Object.entries(stateData.playerCodes).forEach(([slot, code]) => {
          if (!connectionManager.hasCode(code as string)) {
            Logger.StoryRepository.log("Registering new code:", {
              slot,
              code,
            });
            connectionManager.registerCode(
              storyId,
              slot as PlayerSlot,
              code as string
            );
          } else {
            Logger.StoryRepository.log("Code already registered:", {
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

    // Write to file using the utility function
    await writeStorageFile(
      "stories",
      `${storyId}.json`,
      JSON.stringify(state, null, 2)
    );
  }

  async deleteStory(storyId: string): Promise<void> {
    try {
      // Remove from memory cache
      this.storyStates.delete(storyId);

      // Remove file using the utility function
      await deleteStorageFile("stories", `${storyId}.json`);

      Logger.StoryRepository.log("Successfully deleted state:", storyId);
    } catch (error) {
      Logger.StoryRepository.error("Failed to delete state:", error);
      throw error;
    }
  }

  // Helper method to clean up completed or abandoned stories
  async cleanupStories(): Promise<void> {
    try {
      const files = await listStorageFiles("stories");

      for (const file of files) {
        if (!file.endsWith(".json")) continue;

        const storyId = path.parse(file).name;
        const activePlayers = connectionManager.getActivePlayersInGame(storyId);

        // If no active players and story is old, delete it
        if (activePlayers.length === 0) {
          const stats = await getStorageFileStats("stories", file);
          const ageInHours =
            (Date.now() - Number(stats.mtimeMs)) / (1000 * 60 * 60);

          if (ageInHours > 72) {
            // Delete stories older than 72 hours
            await this.deleteStory(storyId);
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

  // Add this method to load all existing stories on startup
  async loadExistingStories(): Promise<void> {
    try {
      const files = await listStorageFiles("stories");
      Logger.StoryRepository.log("Loading existing stories...");

      for (const file of files) {
        if (!file.endsWith(".json")) continue;

        const storyId = path.parse(file).name;
        try {
          const data = await readStorageFile("stories", file);
          const state = JSON.parse(data) as StoryState;
          const story = new Story(state);
          this.storyStates.set(storyId, story);
          Logger.StoryRepository.log("Loaded story:", storyId);
        } catch (error) {
          Logger.StoryRepository.error(
            `Failed to load story ${storyId}:`,
            error
          );
        }
      }

      Logger.StoryRepository.log("Finished loading stories");
      return;
    } catch (error) {
      Logger.StoryRepository.error("Failed to load existing stories:", error);
    }
  }

  getAllStories(): Array<{ storyId: string; story: Story }> {
    return Array.from(this.storyStates.entries()).map(([storyId, story]) => ({
      storyId,
      story,
    }));
  }

  async findStoryByCode(
    code: string
  ): Promise<{ storyId: string; story: Story } | null> {
    Logger.StoryRepository.log("Searching for state with code:", code);

    try {
      const files = await listStorageFiles("stories");
      Logger.StoryRepository.log(
        "Searching through ",
        files.length,
        " story files"
      );

      for (const file of files) {
        if (!file.endsWith(".json")) continue;

        const storyId = path.parse(file).name;
        try {
          const data = await readStorageFile("stories", file);
          const state = JSON.parse(data) as StoryState;
          const story = new Story(state);

          // Check if this state contains the code
          const stateData = story.getState();
          if (
            stateData.playerCodes &&
            Object.values(stateData.playerCodes).some((c) => c === code)
          ) {
            Logger.StoryRepository.log("Found code in story:", storyId);

            // Cache the found state
            this.storyStates.set(storyId, story);
            Logger.StoryRepository.log("Cached found state in memory");

            return { storyId, story };
          }
        } catch (error) {
          Logger.StoryRepository.error(
            `Error checking story ${storyId}:`,
            error
          );
        }
      }

      Logger.StoryRepository.log("Code not found in any story");
      return null;
    } catch (error) {
      Logger.StoryRepository.error("Failed to find state by code:", error);
      return null;
    }
  }
}

// Export singleton instance
export const storyRepository = StoryRepository.getInstance();
