import { StoryTemplate, TemplateMetadata } from "core/types";
import { apiClient } from "shared/apiClient";
import { Logger } from "shared/logger";
import {
  GenerateTemplateRequest,
  TemplateIterationRequest,
} from "core/types/admin";
import { GetTemplateImagesResponse } from "core/types/api";

/**
 * Template API functions that can be used in both admin and user contexts.
 * Permissions are enforced on the server-side based on the user's role.
 */
export const templateApi = {
  /**
   * Get published template metadata for browsing (public access, no auth required)
   * @param forWelcomeScreen If true, only returns templates marked for welcome screen
   */
  getPublishedTemplateMetadata: async (
    forWelcomeScreen = false
  ): Promise<TemplateMetadata[]> => {
    return apiClient
      .get<{ templates: TemplateMetadata[] }>(
        `/templates/published${
          forWelcomeScreen ? "?forWelcomeScreen=true" : ""
        }`
      )
      .then((response) => response.templates);
  },

  /**
   * Get all template metadata (requires admin permissions)
   */
  getAllTemplateMetadata: async (): Promise<TemplateMetadata[]> => {
    return apiClient
      .get<{ templates: TemplateMetadata[] }>("/templates")
      .then((response) => response.templates);
  },

  /**
   * Get template metadata for the current user
   */
  getUserTemplateMetadata: async (): Promise<TemplateMetadata[]> => {
    return apiClient
      .get<{ templates: TemplateMetadata[] }>("/templates/user")
      .then((response) => response.templates);
  },

  /**
   * Get template metadata for a specific user (requires appropriate permissions)
   */
  getUserTemplateMetadataByUserId: async (
    userId: string
  ): Promise<TemplateMetadata[]> => {
    return apiClient
      .get<{ templates: TemplateMetadata[] }>(`/templates/user/${userId}`)
      .then((response) => response.templates);
  },

  /**
   * Get template metadata by ID (requires basic access)
   */
  getTemplateMetadata: async (
    templateId: string
  ): Promise<TemplateMetadata> => {
    const response = await apiClient.get<{ template: TemplateMetadata }>(
      `/templates/${templateId}`
    );
    return response.template;
  },

  /**
   * Get a specific template with full content (requires edit access)
   */
  getTemplate: async (templateId: string): Promise<StoryTemplate> => {
    const response = await apiClient.get<{ template: StoryTemplate }>(
      `/templates/full/${templateId}`
    );
    return response.template;
  },

  /**
   * Create a new template
   */
  createTemplate: async (
    template: Partial<StoryTemplate> | { template: Partial<StoryTemplate> }
  ): Promise<{ template: StoryTemplate }> => {
    // Handle both direct template object and wrapped template object
    const payload = "template" in template ? template : { template };

    const response = await apiClient.post<{ template: StoryTemplate }>(
      "/templates",
      payload
    );
    return response;
  },

  /**
   * Update an existing template
   */
  updateTemplate: async (
    templateId: string,
    template:
      | Partial<StoryTemplate>
      | { template: Partial<StoryTemplate>; id?: string }
  ): Promise<{ template: StoryTemplate }> => {
    // Handle both direct template object and wrapped template object
    const payload = "template" in template ? template : { template };

    const response = await apiClient.put<{ template: StoryTemplate }>(
      `/templates/${templateId}`,
      payload
    );
    return response;
  },

  /**
   * Delete a template
   */
  deleteTemplate: async (templateId: string): Promise<void> => {
    Logger.API.log(`Deleting template: ${templateId}`);
    try {
      await apiClient.delete(`/templates/${templateId}`);
      Logger.API.log(`Successfully deleted template: ${templateId}`);
    } catch (error) {
      Logger.API.error(`Failed to delete template: ${templateId}`, error);
      throw error;
    }
  },

  /**
   * Export templates as a ZIP file
   */
  exportTemplates: async (templateIds: string[]): Promise<Blob> => {
    Logger.API.log(`Exporting templates: ${templateIds.join(", ")}`);
    try {
      const response = await apiClient.post(
        "/templates/export",
        { templateIds },
        { responseType: "blob" }
      );
      Logger.API.log(`Successfully exported ${templateIds.length} templates`);
      return response as unknown as Blob;
    } catch (error) {
      Logger.API.error("Failed to export templates", error);
      throw error;
    }
  },

  /**
   * Import a template from a ZIP file (creates new or updates existing based on template ID in zip)
   */
  importTemplateZip: async (
    zipData: Blob
  ): Promise<{
    template: StoryTemplate;
    filesImported: number;
    files: string[];
    isNewTemplate: boolean;
  }> => {
    const formData = new FormData();
    formData.append("zip", zipData, "template.zip");

    const response = await apiClient.post<{
      template: StoryTemplate;
      filesImported: number;
      files: string[];
      isNewTemplate: boolean;
    }>(`/templates/import`, formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });

    return response;
  },

  /**
   * Import a collection of templates from a ZIP file
   */
  importTemplateCollection: async (
    zipData: Blob
  ): Promise<{ templates: StoryTemplate[] }> => {
    const formData = new FormData();
    formData.append("file", zipData, "collection.zip");

    return apiClient.post<{ templates: StoryTemplate[] }>(
      "/templates/import-collection",
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      }
    );
  },

  /**
   * Helper method to create a download for a blob
   */
  createDownload: (blob: Blob, filename: string): void => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  },

  /**
   * Generate a new template using AI
   */
  generateTemplate: async (
    request: GenerateTemplateRequest
  ): Promise<{ template: StoryTemplate }> => {
    Logger.API.log("Generating template with AI");
    try {
      const response = await apiClient.post<{ template: StoryTemplate }>(
        "/templates/generate",
        request
      );
      Logger.API.log(
        `Successfully generated template: ${response.template.title}`
      );
      return response;
    } catch (error) {
      Logger.API.error("Failed to generate template", error);
      throw error;
    }
  },

  /**
   * Iterate on a template using AI
   */
  iterateTemplate: async (
    id: string,
    request: TemplateIterationRequest
  ): Promise<{ templateUpdate: Partial<StoryTemplate> }> => {
    Logger.API.log(`Iterating template: ${id}`);
    try {
      const response = await apiClient.post<{
        templateUpdate: Partial<StoryTemplate>;
      }>(`/templates/${id}/iterate`, request);
      Logger.API.log(`Successfully iterated template: ${id}`);
      return response;
    } catch (error) {
      Logger.API.error(`Failed to iterate template: ${id}`, error);
      throw error;
    }
  },

  /**
   * Upload a file to a template
   */
  uploadFile: async (
    templateId: string,
    file: File,
    subdir?: string
  ): Promise<{ path: string }> => {
    Logger.API.log(`Uploading file to template ${templateId}`);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const url = subdir
        ? `/templates/${templateId}/files?subdir=${encodeURIComponent(subdir)}`
        : `/templates/${templateId}/files`;

      const response = await apiClient.post<{ path: string }>(url, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      Logger.API.log(`Successfully uploaded file to template ${templateId}`);
      return response;
    } catch (error) {
      Logger.API.error(
        `Failed to upload file to template ${templateId}`,
        error
      );
      throw error;
    }
  },

  /**
   * Get template images and manifest
   */
  getTemplateImages: async (templateId: string): Promise<GetTemplateImagesResponse["data"]> => {
    Logger.API.log(`Getting images for template ${templateId}`);
    try {
      const response = await apiClient.get<GetTemplateImagesResponse["data"]>(
        `/templates/${templateId}/images`
      );
      Logger.API.log(`Successfully retrieved images for template ${templateId}`);
      return response;
    } catch (error) {
      Logger.API.error(
        `Failed to get images for template ${templateId}`,
        error
      );
      throw error;
    }
  },

  /**
   * Rename a template image when element ID changes
   */
  renameTemplateImage: async (
    templateId: string,
    oldElementId: string,
    newElementId: string
  ): Promise<{ success: boolean; message: string }> => {
    Logger.API.log(`Renaming template image: ${oldElementId} -> ${newElementId} for template ${templateId}`);
    try {
      const response = await apiClient.post<{ success: boolean; message: string }>(
        `/images/templates/${templateId}/rename`,
        {
          oldElementId,
          newElementId,
          requestId: `rename-${Date.now()}`
        }
      );
      Logger.API.log(`Successfully renamed template image: ${oldElementId} -> ${newElementId}`);
      return response;
    } catch (error) {
      Logger.API.error(
        `Failed to rename template image: ${oldElementId} -> ${newElementId}`,
        error
      );
      throw error;
    }
  },
};
