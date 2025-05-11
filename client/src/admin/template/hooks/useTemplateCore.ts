import { useState, useCallback } from "react";
import { Logger } from "shared/logger";
import { StoryTemplate } from "core/types";
import { adminApi } from "admin/adminApi";
import { CreateTemplateRequest } from "core/types";
import { formatDate, formatDateTime } from "core/utils/dateUtils";
import { DeleteDialogState } from "../types/templateTypes";

// Type definitions have been moved to templateTypes.ts

export const useTemplateCore = (token: string) => {
  const [templates, setTemplates] = useState<StoryTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState>({
    isOpen: false,
    templateId: "",
  });

  // Load templates from the server
  const loadTemplates = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    Logger.Admin.log("Loading story templates");

    try {
      const response = await adminApi.get(`/admin/templates`, token);

      Logger.Admin.log(
        `Successfully loaded ${response.data.templates.length} story templates`
      );
      setTemplates(response.data.templates);
    } catch (error) {
      Logger.Admin.error("Failed to load story templates", error);
      setError("Failed to load story templates. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  // Delete a template
  const handleDeleteTemplate = async (templateId: string) => {
    Logger.Admin.log(`Attempting to delete template: ${templateId}`);
    try {
      const request = {
        id: templateId,
      };

      await adminApi.delete(`/admin/templates/${templateId}`, token, {
        data: request,
      });

      Logger.Admin.log(`Successfully deleted template: ${templateId}`);
      // Refresh the list
      loadTemplates();
    } catch (error) {
      Logger.Admin.error(`Error deleting template: ${templateId}`, error);
      setError("Failed to delete template. Please try again.");
    }
  };

  // Create a template
  const createTemplate = async (templateData: Partial<StoryTemplate>) => {
    Logger.Admin.log(`Creating template: ${templateData.title}`);
    try {
      // Create template on server
      const templateRequest: CreateTemplateRequest = {
        template: templateData as Partial<StoryTemplate>,
      };

      const response = await adminApi.post(
        `/admin/templates`,
        templateRequest,
        token
      );

      Logger.Admin.log(
        `Successfully created template: ${response.data.template.title}`
      );
      return response.data.template;
    } catch (error) {
      Logger.Admin.error(
        `Error creating template: ${templateData.title}`,
        error
      );
      setError("Failed to create template. Please try again.");
      throw error;
    }
  };

  // Delete dialog management
  const openDeleteDialog = (templateId: string) => {
    setDeleteDialog({
      isOpen: true,
      templateId,
    });
  };

  const closeDeleteDialog = () => {
    setDeleteDialog({
      isOpen: false,
      templateId: "",
    });
  };

  return {
    // State
    templates,
    isLoading,
    error,
    deleteDialog,

    // Date formatting (using shared utils)
    formatDate,
    formatDateTime,

    // Methods
    loadTemplates,
    handleDeleteTemplate,
    createTemplate,
    openDeleteDialog,
    closeDeleteDialog,

    // State setters
    setIsLoading,
    setError,
  };
};
