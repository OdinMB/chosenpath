import { StoryTemplate, UserListItem } from "core/types";
import { AdminStoriesListItem } from "core/types/story.js";
import {
  CreateTemplateRequest,
  UpdateTemplateRequest,
  GenerateTemplateRequest,
  TemplateIterationRequest,
} from "core/types/admin";
import { GetAdminStoriesResponseData } from "core/types/api.js";
import { apiClient } from "shared/apiClient";
import { Logger } from "shared/logger";
import { v4 as uuidv4 } from "uuid";

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

  exportSelectedTemplates: async (templateIds: string[]): Promise<Blob> => {
    Logger.Admin.log(
      `Exporting ${templateIds.length} selected template assets`
    );
    try {
      const params = new URLSearchParams();
      params.append("templateIds", templateIds.join(","));

      const blobResponse = await apiClient.get<Blob>(
        `/admin/templates/all/assets?${params.toString()}`,
        { responseType: "blob" }
      );
      Logger.Admin.log("Successfully exported selected template assets");
      return blobResponse;
    } catch (error) {
      Logger.Admin.error("Failed to export selected template assets", error);
      throw error;
    }
  },

  importTemplateZip: async (
    templateId: string,
    zipData: Blob
  ): Promise<{ filesImported: number; files: string[] }> => {
    Logger.Admin.log(`Importing ZIP to template ${templateId} via admin API`);
    const formData = new FormData();
    formData.append("zip", zipData, "template-assets.zip");

    const requestId = uuidv4();
    const url = `/admin/templates/${templateId}/import?requestId=${requestId}`;

    try {
      const responseData = await apiClient.post<{
        filesImported: number;
        files: string[];
      }>(url, formData, {
        headers: {
          // Authorization: `Bearer ${token}`, // No longer needed
          // 'Content-Type': 'multipart/form-data' is set automatically by axios for FormData
        },
      });
      Logger.Admin.log(
        `Successfully imported ${
          responseData.filesImported
        } files to template ${templateId} from admin API. Files: ${
          responseData.files?.join(", ") || "none"
        }`
      );
      return responseData;
    } catch (error) {
      Logger.Admin.error(
        `Failed to import ZIP to template ${templateId} via admin API`,
        error
      );
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
