import { useState, useEffect } from "react";
import { Logger } from "shared/logger";
import { StoryTemplate } from "core/types";
import { adminTemplateApi } from "admin/adminApi";
import { CreateTemplateRequest } from "core/types";
import { formatDate, formatDateTime } from "core/utils/dateUtils";
import { DeleteDialogState } from "../templateTypes";
import { useRevalidator } from "react-router-dom";

// Type definitions have been moved to templateTypes.ts

export const useTemplateCore = (initialTemplates: StoryTemplate[]) => {
  const [templates, setTemplates] = useState<StoryTemplate[]>(initialTemplates);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState>({
    isOpen: false,
    templateId: "",
  });
  const revalidator = useRevalidator();

  // Effect to update templates when initialTemplates change (e.g., after loader revalidation)
  useEffect(() => {
    setTemplates(initialTemplates);
  }, [initialTemplates]);

  // Delete a template
  const handleDeleteTemplate = async (templateId: string) => {
    Logger.Admin.log(`Attempting to delete template: ${templateId}`);
    try {
      await adminTemplateApi.deleteTemplate(templateId);

      Logger.Admin.log(`Successfully deleted template: ${templateId}`);
      // Revalidate the loader data
      revalidator.revalidate();
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

      const response = await adminTemplateApi.createTemplate(templateRequest);

      Logger.Admin.log(
        `Successfully created template: ${response.template.title}`
      );
      // Revalidate the loader data
      revalidator.revalidate();
      return response.template;
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
    revalidator,
    handleDeleteTemplate,
    createTemplate,
    openDeleteDialog,
    closeDeleteDialog,

    // State setters
    setIsLoading,
    setError,
  };
};
