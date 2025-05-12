import { StoriesListItem, StoryTemplate, UserListItem } from "core/types";
import { CreateTemplateRequest } from "core/types/admin";
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

  deleteTemplate: async (templateId: string): Promise<void> => {
    Logger.Admin.log(`Deleting template: ${templateId}`);
    try {
      await apiClient.delete(`/admin/templates/${templateId}`);
      Logger.Admin.log(`Successfully deleted template: ${templateId}`);
    } catch (error) {
      Logger.Admin.error(`Failed to delete template: ${templateId}`, error);
      throw error;
    }
  },

  createTemplate: async (
    request: CreateTemplateRequest
  ): Promise<{ template: StoryTemplate }> => {
    Logger.Admin.log("Creating template");
    try {
      const response = await apiClient.post<{ template: StoryTemplate }>(
        "/admin/templates",
        request
      );
      Logger.Admin.log(
        `Successfully created template: ${response.template.title}`
      );
      return response;
    } catch (error) {
      Logger.Admin.error("Failed to create template", error);
      throw error;
    }
  },

  exportTemplate: async (
    templateId: string
  ): Promise<{ template: StoryTemplate }> => {
    Logger.Admin.log(`Exporting template: ${templateId}`);
    try {
      const response = await apiClient.get<{ template: StoryTemplate }>(
        `/admin/templates/${templateId}/export`
      );
      Logger.Admin.log(`Successfully exported template: ${templateId}`);
      return response;
    } catch (error) {
      Logger.Admin.error(`Failed to export template: ${templateId}`, error);
      throw error;
    }
  },

  exportAllTemplates: async (): Promise<{ templates: StoryTemplate[] }> => {
    Logger.Admin.log("Exporting all templates");
    try {
      const response = await apiClient.get<{ templates: StoryTemplate[] }>(
        "/admin/templates/export"
      );
      Logger.Admin.log(
        `Successfully exported ${response.templates.length} templates`
      );
      return response;
    } catch (error) {
      Logger.Admin.error("Failed to export all templates", error);
      throw error;
    }
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
