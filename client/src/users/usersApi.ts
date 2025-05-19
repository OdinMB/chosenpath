import { userStoriesApi } from "shared/apiClient";
import {
  ExtendedStoryMetadata,
  UserStoryCodeAssociation,
  UserStoryCounts,
} from "core/types/api";
import { Logger } from "shared/logger";

export const usersApi = {
  getAllUserStories: async (): Promise<ExtendedStoryMetadata[]> => {
    Logger.App.log("Fetching all user related stories via usersApi");
    try {
      const response = await userStoriesApi.getAllUserStories();
      Logger.App.log(
        `Successfully fetched ${response.stories.length} user related stories`
      );
      return response.stories as ExtendedStoryMetadata[];
    } catch (error) {
      Logger.App.error(
        "Failed to fetch all user related stories via usersApi",
        error
      );
      throw error;
    }
  },

  getStoryCodes: async (): Promise<UserStoryCodeAssociation[]> => {
    Logger.App.log("Fetching user story codes via usersApi");
    try {
      const response = await userStoriesApi.getStoryCodes();
      Logger.App.log(
        `Successfully fetched ${response.storyCodes.length} story codes`
      );
      return response.storyCodes;
    } catch (error) {
      Logger.App.error("Failed to fetch story codes via usersApi", error);
      throw error;
    }
  },

  getUserStoryCounts: async (): Promise<UserStoryCounts> => {
    Logger.App.log("Fetching user story counts via usersApi");
    try {
      const response = await userStoriesApi.getUserStoryCounts();
      Logger.App.log(
        `Successfully fetched user story counts: SP: ${response.counts.singlePlayerActiveCount}, MP: ${response.counts.multiPlayerActiveCount}, Pending: ${response.counts.multiPlayerPendingCount}`
      );
      return response.counts;
    } catch (error) {
      Logger.App.error("Failed to fetch user story counts via usersApi", error);
      throw error;
    }
  },
};
