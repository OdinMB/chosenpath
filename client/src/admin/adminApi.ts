import { StoriesListItem, StoryTemplate, UserListItem } from "core/types";
import { apiClient } from "shared/apiClient";
import { Logger } from "shared/logger";

// Admin Story API functions
export const adminStoryApi = {
  getStories: async (): Promise<StoriesListItem[]> => {
    Logger.Admin.log("Fetching stories from admin API");
    try {
      const response = await apiClient.get<{ stories: StoriesListItem[] }>(
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

// Admin Template API functions
export const adminTemplateApi = {
  getTemplates: async (): Promise<StoryTemplate[]> => {
    return apiClient
      .get<{ templates: StoryTemplate[] }>(`/admin/templates`)
      .then((response) => response.templates);
  },

  getTemplate: async (templateId: string): Promise<StoryTemplate> => {
    return apiClient
      .get<{ template: StoryTemplate }>(`/admin/templates/${templateId}`)
      .then((response) => response.template);
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
