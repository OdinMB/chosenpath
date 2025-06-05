import { storyRepository } from "./StoryRepository.js";
import { Logger } from "../shared/logger.js";
import { Story } from "core/models/Story.js";
import {
  storyDbService,
  StoryDbOverviewItem,
} from "server/stories/StoryDbService.js";
import { AdminStoriesListItem } from "core/types/story.js";

export class AdminStoryService {
  /**
   * Get a list of all stories with combined DB and file metadata
   */
  async getStoriesList(): Promise<AdminStoriesListItem[]> {
    Logger.AdminService.log("Starting getStoriesList (DB-focused)");
    try {
      const dbStories: StoryDbOverviewItem[] =
        await storyDbService.getStoryOverviewList();
      Logger.AdminService.log(
        `Fetched ${dbStories.length} stories from DB overview`
      );

      const storiesInfo: AdminStoriesListItem[] = await Promise.all(
        dbStories.map(async (dbStory) => {
          let storyModel: Story | null = null;
          let storyJsonError: string | undefined = undefined;
          let storyTitleFromModel: string | null = null;
          let gameModeFromModel: string | null = null;
          let characterSelectionCompletedFromModel: boolean = false; // Default if JSON not found

          try {
            storyModel = await storyRepository.getStory(dbStory.id);
            if (storyModel) {
              storyTitleFromModel = storyModel.getTitle(); // Might be more accurate if AI generated
              gameModeFromModel = storyModel.getGameMode();
              characterSelectionCompletedFromModel =
                storyModel.getState().characterSelectionCompleted;
            } else {
              // This case means DB entry exists, but story file/JSON is missing or unparsable by StoryRepository
              storyJsonError = "Story file not found or unreadable.";
              Logger.AdminService.warn(
                `Story file for ${dbStory.id} not found or unreadable, though DB entry exists.`
              );
            }
          } catch (error) {
            storyJsonError = (error as Error).message;
            Logger.AdminService.error(
              `Error processing story file for ${dbStory.id}:`,
              error
            );
          }

          // Get player status information for admin display
          const playerStatusCounts = {
            active: dbStory.active_count,
            archived: dbStory.archived_count,
            deleted: dbStory.deleted_count,
          };

          // Prefer title from Story model if available and DB title is null, otherwise use DB title.
          // If both are null, it remains null.
          const finalTitle =
            dbStory.title === null && storyTitleFromModel !== null
              ? storyTitleFromModel
              : dbStory.title;

          return {
            id: dbStory.id,
            title: finalTitle || "Untitled Story",
            createdAt: new Date(dbStory.created_at).toISOString(),
            updatedAt: new Date(dbStory.updated_at).toISOString(),
            gameMode: gameModeFromModel,
            difficultyLevel: {
              title: dbStory.difficulty_title,
              modifier: dbStory.difficulty_modifier,
            },
            playerCount: dbStory.player_count,
            characterSelectionCompleted: characterSelectionCompletedFromModel,
            maxTurns: dbStory.max_turns,
            currentBeat: dbStory.current_beat,
            templateId: dbStory.template_id,
            error: storyJsonError,
            playerStatusCounts,
          };
        })
      );

      Logger.AdminService.log(
        `Successfully processed and enriched all ${storiesInfo.length} stories`
      );
      return storiesInfo;
    } catch (error) {
      Logger.AdminService.error("Failed to load stories list", error);
      // If storyDbService.getStoryOverviewList() throws, this will catch it.
      throw new Error("Failed to load stories list");
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
    Logger.AdminService.log(`Deleting story (DB and files): ${storyId}`);
    try {
      // Step 1: Delete database entries (story and associated players)
      // This is done first so if file deletion fails, we don't have orphaned DB entries.
      // If DB deletion fails, we don't attempt file deletion.
      await storyDbService.deleteStoryWithPlayers(storyId);
      Logger.AdminService.log(
        `Successfully deleted DB entries for story: ${storyId}`
      );

      // Step 2: Delete story directory from file system
      try {
        await storyRepository.deleteStory(storyId); // This deletes the directory
        Logger.AdminService.log(
          `Successfully deleted story directory from file system: ${storyId}`
        );
      } catch (fileError) {
        // Log the error, but don't let it hide a successful DB deletion.
        // The overall operation might be considered partially successful or require manual cleanup for files.
        Logger.AdminService.error(
          `Failed to delete story directory for ${storyId} after DB deletion. Manual cleanup may be required.`,
          fileError
        );
        // Optionally, re-throw or handle as a more critical failure if strict consistency is paramount.
        // For now, we'll consider DB deletion the more critical part for data integrity.
      }
    } catch (error) {
      Logger.AdminService.error(
        `Failed to delete story ${storyId} (DB or files):`,
        error
      );
      // Re-throw the original error (could be from DB or initial file system error if we changed order)
      throw error;
    }
  }
}

// Export singleton instance
export const adminStoryService = new AdminStoryService();
