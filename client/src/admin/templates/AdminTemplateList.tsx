import { useLoaderData, useNavigate } from "react-router-dom";
import { TemplateOverview } from "resources/templates/TemplateOverview.js";
import { createDefaultTemplate } from "resources/templates/utils/templateFactory.js";
import { Logger } from "shared/logger.js";
import { templateApi } from "resources/templates/templateApi.js";
import { TemplateMetadata } from "core/types";
import { useState } from "react";

/**
 * Admin wrapper for the template overview component
 * Uses admin-specific template handling logic
 */
export const AdminTemplateList = () => {
  const { templates: initialTemplates } = useLoaderData() as {
    templates: TemplateMetadata[];
  };
  const [templates, setTemplates] =
    useState<TemplateMetadata[]>(initialTemplates);
  const navigate = useNavigate();

  // Admin-specific handlers
  const handleEdit = (templateId: string) => {
    navigate(`/admin/templates/${templateId}`);
  };

  const handleDelete = async (templateId: string) => {
    try {
      await templateApi.deleteTemplate(templateId);
      // Remove the deleted template from local state for immediate UI update
      setTemplates((prevTemplates) =>
        prevTemplates.filter((template) => template.id !== templateId)
      );
      Logger.Admin.log(`Successfully deleted template: ${templateId}`);
    } catch (error) {
      Logger.Admin.error(`Failed to delete template: ${templateId}`, error);
      throw error; // Re-throw so the TemplateOverview can handle the error display
    }
  };

  const handleCreateNew = async () => {
    try {
      const defaultTemplate = createDefaultTemplate();
      const response = await templateApi.createTemplate(defaultTemplate);
      navigate(`/admin/templates/${response.template.id}`);
    } catch (error) {
      Logger.Admin.error("Failed to create new template", error);
    }
  };

  return (
    <TemplateOverview
      initialTemplates={templates}
      onEdit={handleEdit}
      onDelete={handleDelete}
      onCreateNew={handleCreateNew}
      canPublish={true}
      canExportAll={true}
      canImport={true}
    />
  );
};
