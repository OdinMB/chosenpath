import { StoriesListItem, StoryTemplate, UserListItem } from "core/types";
import {
  CreateTemplateRequest,
  UpdateTemplateRequest,
  GenerateTemplateRequest,
  TemplateIterationRequest,
} from "core/types/admin";
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

  updateTemplate: async (
    request: UpdateTemplateRequest
  ): Promise<{ template: StoryTemplate }> => {
    Logger.Admin.log(`Updating template: ${request.id}`);
    try {
      const response = await apiClient.put<{ template: StoryTemplate }>(
        `/admin/templates/${request.id}`,
        { template: request.template } // Ensure body matches server expectation if request is { template: ... }
      );
      Logger.Admin.log(
        `Successfully updated template: ${response.template.title}`
      );
      return response;
    } catch (error) {
      Logger.Admin.error(`Failed to update template: ${request.id}`, error);
      throw error;
    }
  },

  exportTemplate: async (templateId: string): Promise<Blob> => {
    Logger.Admin.log(`Exporting template assets: ${templateId}`);
    try {
      const blobResponse = await apiClient.get<Blob>(
        `/admin/templates/${templateId}/assets`,
        { responseType: "blob" }
      );
      Logger.Admin.log(`Successfully exported template assets: ${templateId}`);
      return blobResponse;
    } catch (error) {
      Logger.Admin.error(
        `Failed to export template assets: ${templateId}`,
        error
      );
      throw error;
    }
  },

  exportAllTemplates: async (): Promise<Blob> => {
    Logger.Admin.log("Exporting all template assets");
    try {
      const blobResponse = await apiClient.get<Blob>(
        "/admin/templates/all/assets",
        { responseType: "blob" }
      );
      Logger.Admin.log("Successfully exported all template assets");
      return blobResponse;
    } catch (error) {
      Logger.Admin.error("Failed to export all template assets", error);
      throw error;
    }
  },

  generateTemplateViaApi: async (
    request: GenerateTemplateRequest
  ): Promise<{ template: StoryTemplate }> => {
    Logger.Admin.log("Generating template via API", request);
    try {
      const response = await apiClient.post<{ template: StoryTemplate }>(
        "/admin/templates/generate",
        request
      );
      Logger.Admin.log(
        `Successfully generated template via API: ${response.template.title}`
      );
      return response;
    } catch (error) {
      Logger.Admin.error("Failed to generate template via API", error);
      throw error;
    }
  },

  iterateTemplate: async (
    request: TemplateIterationRequest
  ): Promise<{ templateUpdate: Partial<StoryTemplate> }> => {
    Logger.Admin.log(`Iterating template: ${request.templateId}`, request);
    try {
      const response = await apiClient.post<{
        templateUpdate: Partial<StoryTemplate>;
      }>(
        `/admin/templates/${request.templateId}/iterate`,
        request // Send the whole request object as the body
      );
      Logger.Admin.log(
        `Successfully iterated template: ${request.templateId}`,
        response.templateUpdate
      );
      return response;
    } catch (error) {
      Logger.Admin.error(
        `Failed to iterate template: ${request.templateId}`,
        error
      );
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
