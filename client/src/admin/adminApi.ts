import { UserListItem } from "core/types";
import { AdminStoriesListItem } from "core/types/story.js";
import { GetAdminStoriesResponseData } from "core/types/api.js";
import { apiClient } from "shared/apiClient";
import { Logger } from "shared/logger";

// Admin Story API functions
export const adminStoryApi = {
  getStories: async (): Promise<AdminStoriesListItem[]> => {
    Logger.Admin.log("Fetching stories from admin API");
    try {
      const response = await apiClient.get<GetAdminStoriesResponseData>(
        `/admin/stories`
      );
      Logger.Admin.log(
        `Successfully fetched ${response.stories.length} stories`
      );
      return response.stories;
    } catch (error) {
      Logger.Admin.error("Failed to fetch stories from admin API", error);
      throw error;
    }
  },

  deleteStory: async (storyId: string): Promise<void> => {
    return apiClient.delete(`/admin/stories/${storyId}`);
  },
};

// Admin Users API functions
export const adminUsersApi = {
  getUsers: async (): Promise<UserListItem[]> => {
    Logger.Admin.log("Fetching users from admin API");
    try {
      const response = await apiClient.get<{ users: UserListItem[] }>(
        `/admin/users`
      );
      Logger.Admin.log(`Successfully fetched ${response.users.length} users`);
      return response.users;
    } catch (error) {
      Logger.Admin.error("Failed to fetch users from admin API", error);
      throw error;
    }
  },

  deleteUser: async (userId: string): Promise<void> => {
    Logger.Admin.log(`Deleting user: ${userId}`);
    try {
      await apiClient.delete(`/admin/users/${userId}`);
      Logger.Admin.log(`Successfully deleted user: ${userId}`);
    } catch (error) {
      Logger.Admin.error(`Failed to delete user: ${userId}`, error);
      throw error;
    }
  },
};
