import { storyRepository } from "../services/StoryRepository.js";
import {
  readStorageFile,
  listStorageFiles,
  getStorageFileStats,
} from "../utils/storageUtils.js";
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
  error?: string;
};

export class AdminStoryService {
  /**
   * Get a list of all stories with basic metadata
   */
  async getStoriesList(): Promise<StoryInfo[]> {
    try {
      const files = await listStorageFiles("stories");
      const storyFiles = files.filter((file) => file.endsWith(".json"));

      // Get basic info for each story
      const storiesInfo = await Promise.all(
        storyFiles.map(async (file) => {
          try {
            const storyId = path.parse(file).name;
            const data = await readStorageFile("stories", file);
            const storyData = JSON.parse(data);

            // Get file stats for last modified time
            const fileStats = await getStorageFileStats("stories", file);

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
            };
          } catch (error) {
            return {
              id: path.parse(file).name,
              title: "Error loading story",
              error: (error as Error).message,
            } as StoryInfo;
          }
        })
      );

      return storiesInfo;
    } catch (error) {
      console.error("Failed to load stories:", error);
      throw new Error("Failed to load stories");
    }
  }

  /**
   * Get details of a specific story
   */
  async getStory(storyId: string) {
    const story = await storyRepository.getStory(storyId);

    if (!story) {
      throw new Error("Story not found");
    }

    return story.getState();
  }

  /**
   * Delete a story
   */
  async deleteStory(storyId: string): Promise<void> {
    await storyRepository.deleteStory(storyId);
  }
}

// Export singleton instance
export const adminStoryService = new AdminStoryService();
