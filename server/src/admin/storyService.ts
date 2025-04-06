import { storyRepository } from "../services/StoryRepository.js";
import {
  readStorageFile,
  listStorageFiles,
  getStorageFileStats,
} from "../utils/storageUtils.js";
import { Logger } from "../utils/logger.js";
import { Story } from "shared/models/Story.js";
import path from "path";

export type StoryInfo = {
  id: string;
  title: string;
  createdAt: string | null;
  updatedAt: string;
  gameMode: string;
  playerCount: number;
  characterSelectionCompleted: boolean;
  maxTurns: number;
  currentBeat: number;
  error?: string;
};

export class AdminStoryService {
  /**
   * Get a list of all stories with basic metadata
   */
  async getStoriesList(): Promise<StoryInfo[]> {
    try {
      Logger.AdminService.log("Loading list of stories");
      const files = await listStorageFiles("stories");
      const storyFiles = files.filter((file) => file.endsWith(".json"));
      Logger.AdminService.log(`Found ${storyFiles.length} story files`);

      // Get basic info for each story
      const storiesInfo = await Promise.all(
        storyFiles.map(async (file) => {
          try {
            const storyId = path.parse(file).name;
            Logger.AdminService.log(`Loading metadata for story: ${storyId}`);

            const data = await readStorageFile("stories", file);
            const storyData = JSON.parse(data);

            // Create a Story instance to leverage its methods
            const story = Story.create(storyData);

            // Get file stats for last modified time
            const fileStats = await getStorageFileStats("stories", file);

            // Return story info with ID directly using Story methods
            return {
              id: storyId,
              title: story.getTitle(),
              createdAt: (storyData as any).createdAt || null,
              updatedAt: new Date(fileStats.mtime).toISOString(),
              gameMode: story.getGameMode(),
              playerCount: story.getNumberOfPlayers(),
              characterSelectionCompleted:
                story.getState().characterSelectionCompleted,
              maxTurns: story.getMaxTurns(),
              currentBeat: story.getState().characterSelectionCompleted
                ? story.getCurrentTurn()
                : 0,
            };
          } catch (error) {
            Logger.AdminService.error(
              `Error loading story file: ${file}`,
              error
            );
            return {
              id: path.parse(file).name,
              title: "Error loading story",
              error: (error as Error).message,
              currentBeat: 0,
            } as StoryInfo;
          }
        })
      );

      Logger.AdminService.log(
        `Successfully loaded metadata for ${storiesInfo.length} stories`
      );
      return storiesInfo;
    } catch (error) {
      Logger.AdminService.error("Failed to load stories", error);
      throw new Error("Failed to load stories");
    }
  }

  /**
   * Get details of a specific story
   */
  async getStory(storyId: string) {
    Logger.AdminService.log(`Loading full details for story: ${storyId}`);
    const story = await storyRepository.getStory(storyId);

    if (!story) {
      Logger.AdminService.error(`Story not found: ${storyId}`);
      throw new Error("Story not found");
    }

    Logger.AdminService.log(`Successfully loaded story details: ${storyId}`);
    return story.getState();
  }

  /**
   * Delete a story
   */
  async deleteStory(storyId: string): Promise<void> {
    Logger.AdminService.log(`Deleting story: ${storyId}`);
    try {
      await storyRepository.deleteStory(storyId);
      Logger.AdminService.log(`Successfully deleted story: ${storyId}`);
    } catch (error) {
      Logger.AdminService.error(`Failed to delete story: ${storyId}`, error);
      throw error;
    }
  }
}

// Export singleton instance
export const adminStoryService = new AdminStoryService();
