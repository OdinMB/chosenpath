import { useLoaderData, useNavigate } from "react-router-dom";
import { TemplateOverview } from "resources/templates/TemplateOverview.js";
import { createDefaultTemplate } from "resources/templates/utils/templateFactory.js";
import { Logger } from "shared/logger.js";
import { templateApi } from "resources/templates/templateApi.js";
import { StoryTemplate } from "core/types";

/**
 * Admin wrapper for the template overview component
 * Uses admin-specific template handling logic
 */
export const AdminTemplateList = () => {
  const { templates } = useLoaderData() as { templates: StoryTemplate[] };
  const navigate = useNavigate();

  // Admin-specific handlers
  const handleEdit = (templateId: string) => {
    navigate(`/admin/templates/${templateId}`);
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
      onCreateNew={handleCreateNew}
      canPublish={true}
      canExportAll={true}
      canImport={true}
    />
  );
};
