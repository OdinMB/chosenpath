import { storyRepository } from "../services/StoryRepository.js";
import {
  readStorageFile,
  listStorageFiles,
  getStorageFileStats,
} from "../utils/storageUtils.js";
import { Logger } from "../utils/logger.js";
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
  fileSize: number;
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

            // Get file stats for last modified time
            const fileStats = await getStorageFileStats("stories", file);

            // Calculate current beat from beatHistory if available
            let currentBeat = 0;
            if (storyData.characterSelectionCompleted) {
              // Look for beatHistory in each player
              const playerBeats = Object.values(storyData.players || {}).map(
                (player: any) => {
                  return player.beatHistory?.length || 0;
                }
              );

              // Use the maximum number of beats across all players
              currentBeat =
                playerBeats.length > 0 ? Math.max(...playerBeats) : 1;
            }

            // Extract relevant information
            return {
              id: storyId,
              title: storyData.title || "Untitled",
              createdAt: storyData.createdAt || null,
              updatedAt: new Date(fileStats.mtime).toISOString(),
              gameMode: storyData.gameMode || "unknown",
              playerCount: Object.keys(storyData.players || {}).length,
              characterSelectionCompleted:
                storyData.characterSelectionCompleted || false,
              maxTurns: storyData.maxTurns || 0,
              fileSize: data.length,
              currentBeat,
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
