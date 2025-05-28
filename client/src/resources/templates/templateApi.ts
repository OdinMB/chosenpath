import { StoryTemplate } from "core/types";
import { apiClient } from "shared/apiClient";
import { Logger } from "shared/logger";
import {
  GenerateTemplateRequest,
  TemplateIterationRequest,
} from "core/types/admin";

/**
 * Template API functions that can be used in both admin and user contexts.
 * Permissions are enforced on the server-side based on the user's role.
 */
export const templateApi = {
  /**
   * Get published templates, optionally filtered for welcome screen
   * @param forWelcomeScreen If true, only returns templates marked for welcome screen
   */
  getPublishedTemplates: async (
    forWelcomeScreen = false
  ): Promise<StoryTemplate[]> => {
    return apiClient
      .get<{ templates: StoryTemplate[] }>(
        `/templates/published${
          forWelcomeScreen ? "?forWelcomeScreen=true" : ""
        }`
      )
      .then((response) => response.templates);
  },

  /**
   * Get a playable template (public access, no auth required)
   * Includes both published templates and private templates if user has direct access
   */
  getPlayableTemplate: async (templateId: string): Promise<StoryTemplate> => {
    const response = await apiClient.get<{ template: StoryTemplate }>(
      `/templates/playable/${templateId}`
    );
    return response.template;
  },

  /**
   * Get all templates (requires admin or appropriate permissions)
   */
  getAllTemplates: async (): Promise<StoryTemplate[]> => {
    return apiClient
      .get<{ templates: StoryTemplate[] }>("/templates")
      .then((response) => response.templates);
  },

  /**
   * Get templates for the current user
   */
  getUserTemplates: async (): Promise<StoryTemplate[]> => {
    return apiClient
      .get<{ templates: StoryTemplate[] }>("/templates/user")
      .then((response) => response.templates);
  },

  /**
   * Get templates for a specific user (requires appropriate permissions)
   */
  getUserTemplatesByUserId: async (
    userId: string
  ): Promise<StoryTemplate[]> => {
    return apiClient
      .get<{ templates: StoryTemplate[] }>(`/templates/user/${userId}`)
      .then((response) => response.templates);
  },

  /**
   * Get a specific template with access check
   */
  getTemplate: async (templateId: string): Promise<StoryTemplate> => {
    const response = await apiClient.get<{ template: StoryTemplate }>(
      `/templates/${templateId}`
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
   * Import a template from a ZIP file
   */
  importTemplateZip: async (
    templateId: string,
    zipData: Blob
  ): Promise<{ filesImported: number; files: string[] }> => {
    const formData = new FormData();
    formData.append("zip", zipData, "assets.zip");

    const response = await apiClient.post<{
      success: boolean;
      filesImported: number;
      files: string[];
    }>(`/templates/${templateId}/import`, formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });

    return {
      filesImported: response.filesImported,
      files: response.files,
    };
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
   * Import a zip file of template assets
   */
  importTemplateFiles: async (
    templateId: string,
    zipFile: File
  ): Promise<{ filesImported: number; files: string[] }> => {
    Logger.API.log(`Importing files to template ${templateId}`);
    try {
      const formData = new FormData();
      formData.append("zip", zipFile);

      const response = await apiClient.post<{
        filesImported: number;
        files: string[];
      }>(`/templates/${templateId}/import`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      Logger.API.log(
        `Successfully imported ${response.filesImported} files to template ${templateId}`
      );
      return response;
    } catch (error) {
      Logger.API.error(
        `Failed to import files to template ${templateId}`,
        error
      );
      throw error;
    }
  },
};
