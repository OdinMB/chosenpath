import { useLoaderData, useNavigate } from "react-router-dom";
import { TemplateOverview } from "resources/templates/TemplateOverview.js";
import { createDefaultTemplate } from "resources/templates/utils/templateFactory.js";
import { Logger } from "shared/logger.js";
import { templateApi } from "resources/templates/templateApi.js";
import { StoryTemplate } from "core/types";
import { useAuth } from "client/shared/auth/useAuth.js";

/**
 * User template list component for users with templates_create permission
 */
export const UserTemplateList = () => {
  const { templates } = useLoaderData() as { templates: StoryTemplate[] };
  const navigate = useNavigate();
  const { user } = useAuth();

  // Check if user has templates_create permission
  const hasTemplateCreatePermission =
    user?.permissions?.includes("templates_create") || false;

  // User-specific handlers
  const handleEdit = (templateId: string) => {
    navigate(`/users/my-worlds/${templateId}`);
  };

  const handleCreateNew = async () => {
    try {
      const defaultTemplate = createDefaultTemplate();
      const response = await templateApi.createTemplate(defaultTemplate);
      navigate(`/users/my-worlds/${response.template.id}`);
    } catch (error) {
      Logger.UI.error("Failed to create new template", error);
    }
  };

  // If user doesn't have permission, show a message
  if (!hasTemplateCreatePermission) {
    return (
      <div className="container mx-auto p-4">
        <div className="text-center py-12">
          <h2 className="text-xl font-semibold text-gray-600 mb-4">
            Template Creation Not Available
          </h2>
          <p className="text-gray-500">
            You don't have permission to create or manage templates.
          </p>
        </div>
      </div>
    );
  }

  return (
    <TemplateOverview
      initialTemplates={templates}
      onEdit={handleEdit}
      onCreateNew={handleCreateNew}
      canPublish={false} // Users can't publish templates
      canExportAll={true}
      canImport={true}
    />
  );
};
