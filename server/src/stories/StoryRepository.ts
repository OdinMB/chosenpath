import type { StoryState, PlayerSlot } from "core/types/index.js";
import { Story } from "core/models/Story.js";
import { Logger } from "shared/logger.js";
import {
  readStoryFile,
  writeStoryFile,
  deleteStoryDirectory,
  getPregeneratedStoryFilePath,
  listPregeneratedStoryFiles,
  deleteAllPregeneratedStoryFiles,
  deletePregeneratedStoryFilesForTurn,
} from "shared/storageUtils.js";
import fs from "fs/promises";

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
    // Logger.StoryRepository.log("Getting state for story:", storyId);

    // Check memory cache first
    const cachedStory = this.storyStates.get(storyId);
    if (cachedStory) {
      // Logger.StoryRepository.log("Found state in memory cache");
      // Return a fresh copy by cloning the story with its current state
      return new Story(JSON.parse(JSON.stringify(cachedStory.getState())));
    }

    Logger.StoryRepository.log("State not in cache, loading from file...");

    // If not in memory, try loading from file
    try {
      const data = await readStoryFile(storyId);
      const state = JSON.parse(data) as StoryState;

      // Logger.StoryRepository.log("Successfully loaded state from file");

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

  // ========== Pregeneration Methods ==========

  /**
   * Gets a pregenerated story state from storage
   * @param storyId - The story ID
   * @param turn - The turn number
   * @param playerSlot - The player slot
   * @param optionIndex - The option index (0, 1, or 2)
   * @returns The pregenerated Story instance or null if not found
   */
  async getPregeneratedStory(
    storyId: string,
    turn: number,
    playerSlot: PlayerSlot,
    optionIndex: number
  ): Promise<Story | null> {
    const filePath = getPregeneratedStoryFilePath(
      storyId,
      turn,
      playerSlot,
      optionIndex
    );

    Logger.StoryRepository.log(
      `Getting pregenerated state for story: ${storyId}, turn: ${turn}, player: ${playerSlot}, option: ${optionIndex}`
    );

    try {
      const data = await fs.readFile(filePath, "utf-8");
      const state = JSON.parse(data) as StoryState;

      Logger.StoryRepository.log(
        "Successfully loaded pregenerated state from file"
      );

      // Create and return a Story instance
      return new Story(state);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        Logger.StoryRepository.log(
          "Pregenerated story file not found:",
          filePath
        );
      } else {
        Logger.StoryRepository.error(
          "Failed to load pregenerated state:",
          error
        );
      }
      return null;
    }
  }

  /**
   * Stores a pregenerated story state to storage
   * @param storyId - The story ID
   * @param turn - The turn number
   * @param playerSlot - The player slot
   * @param optionIndex - The option index (0, 1, or 2)
   * @param story - The Story instance to store
   */
  async storePregeneratedStory(
    storyId: string,
    turn: number,
    playerSlot: PlayerSlot,
    optionIndex: number,
    story: Story
  ): Promise<void> {
    const filePath = getPregeneratedStoryFilePath(
      storyId,
      turn,
      playerSlot,
      optionIndex
    );

    try {
      const state = story.getState();
      await fs.writeFile(filePath, JSON.stringify(state, null, 2));

      Logger.StoryRepository.log("Successfully stored pregenerated state");
    } catch (error) {
      Logger.StoryRepository.error(
        "Failed to store pregenerated state:",
        error
      );
      throw error;
    }
  }

  /**
   * Deletes a specific pregenerated story file
   * @param storyId - The story ID
   * @param turn - The turn number
   * @param playerSlot - The player slot
   * @param optionIndex - The option index
   */
  async deletePregeneratedStory(
    storyId: string,
    turn: number,
    playerSlot: PlayerSlot,
    optionIndex: number
  ): Promise<void> {
    const filePath = getPregeneratedStoryFilePath(
      storyId,
      turn,
      playerSlot,
      optionIndex
    );

    try {
      await fs.unlink(filePath);
      Logger.StoryRepository.log("Successfully deleted pregenerated state");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        Logger.StoryRepository.error(
          "Failed to delete pregenerated state:",
          error
        );
        throw error;
      }
      // If file doesn't exist, that's fine
    }
  }

  /**
   * Deletes all pregenerated story files for a given story
   * @param storyId - The story ID
   */
  async deleteAllPregeneratedStories(storyId: string): Promise<void> {
    try {
      await deleteAllPregeneratedStoryFiles(storyId);
      Logger.StoryRepository.log(
        "Successfully deleted all pregenerated states"
      );
    } catch (error) {
      Logger.StoryRepository.error(
        "Failed to delete pregenerated states:",
        error
      );
      throw error;
    }
  }

  /**
   * Deletes all pregenerated story files for a specific turn
   * @param storyId - The story ID
   * @param turn - The turn number
   */
  async deletePregeneratedStoriesForTurn(
    storyId: string,
    turn: number
  ): Promise<void> {
    try {
      await deletePregeneratedStoryFilesForTurn(storyId, turn);
      Logger.StoryRepository.log(
        "Successfully deleted pregenerated states for turn"
      );
    } catch (error) {
      Logger.StoryRepository.error(
        "Failed to delete pregenerated states for turn:",
        error
      );
      throw error;
    }
  }

  /**
   * Lists all pregenerated story files for a given story
   * @param storyId - The story ID
   * @returns Array of pregenerated file information
   */
  async listPregeneratedStories(storyId: string): Promise<
    Array<{
      turn: number;
      playerSlot: string;
      optionIndex: number;
    }>
  > {
    // Logger.StoryRepository.log(
    //   `Listing pregenerated states for story: ${storyId}`
    // );

    try {
      const files = await listPregeneratedStoryFiles(storyId);
      return files.map(({ turn, playerSlot, optionIndex }) => ({
        turn,
        playerSlot,
        optionIndex,
      }));
    } catch (error) {
      Logger.StoryRepository.error(
        "Failed to list pregenerated states:",
        error
      );
      throw error;
    }
  }

  /**
   * Checks if a pregenerated story exists
   * @param storyId - The story ID
   * @param turn - The turn number
   * @param playerSlot - The player slot
   * @param optionIndex - The option index
   * @returns True if the pregenerated story exists
   */
  async hasPregeneratedStory(
    storyId: string,
    turn: number,
    playerSlot: PlayerSlot,
    optionIndex: number
  ): Promise<boolean> {
    const filePath = getPregeneratedStoryFilePath(
      storyId,
      turn,
      playerSlot,
      optionIndex
    );

    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}

// Export singleton instance
export const storyRepository = StoryRepository.getInstance();
