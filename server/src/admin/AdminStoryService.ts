import { storyRepository } from "shared/StoryRepository.js";
import {
  listStoryDirectories,
  readStoryFile,
  getStoryFilePath,
} from "shared/storageUtils.js";
import { Logger } from "shared/logger.js";
import { Story } from "core/models/Story.js";
import fs from "fs/promises";

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
  templateId?: string;
  error?: string;
};

export class AdminStoryService {
  /**
   * Get a list of all stories with basic metadata
   */
  async getStoriesList(): Promise<StoryInfo[]> {
    try {
      Logger.AdminService.log("Loading list of stories");
      const storyIds = await listStoryDirectories();
      Logger.AdminService.log(`Found ${storyIds.length} story directories`);

      // Get basic info for each story
      const storiesInfo = await Promise.all(
        storyIds.map(async (storyId) => {
          try {
            Logger.AdminService.log(`Loading metadata for story: ${storyId}`);

            const data = await readStoryFile(storyId);
            const storyData = JSON.parse(data);

            // Create a Story instance to leverage its methods
            const story = Story.create(storyData);

            // Get file stats for last modified time
            const storyFilePath = getStoryFilePath(storyId);
            const fileStats = await fs.stat(storyFilePath);

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
              templateId: story.getState().templateId,
            };
          } catch (error) {
            Logger.AdminService.error(`Error loading story: ${storyId}`, error);
            return {
              id: storyId,
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
