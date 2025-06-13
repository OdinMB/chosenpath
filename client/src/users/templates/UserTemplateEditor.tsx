import { useLoaderData } from "react-router-dom";
import { TemplateForm } from "resources/templates/components/TemplateForm.js";
import { StoryTemplate } from "core/types/index.js";
import { Logger } from "shared/logger.js";
import { UpdateTemplateRequest } from "core/types/admin.js";
import { templateApi } from "resources/templates/templateApi.js";
import { useAuth } from "client/shared/auth/useAuth.js";

/**
 * User template editor component for users with templates_create permission
 */
export const UserTemplateEditor = () => {
  // The loader returns { template } so we need to extract it
  const loaderData = useLoaderData() as { template: StoryTemplate };
  const template = loaderData?.template;
  const { user, isLoading } = useAuth();

  // Check if user has templates_create permission
  const hasTemplateCreatePermission =
    user?.permissions?.includes("templates_create") || false;

  Logger.UI.log("Template data loaded:", template);

  if (!template) {
    Logger.UI.error("Template data not found or invalid format");
    return (
      <div className="p-4">
        Error: Template data not found or invalid format.
      </div>
    );
  }

  // Show loading while authentication is in progress
  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="w-8 h-8 border-t-2 border-b-2 border-primary-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  // If user doesn't have permission, show a message
  if (!hasTemplateCreatePermission) {
    return (
      <div className="container mx-auto p-4">
        <div className="text-center py-12">
          <h2 className="text-xl font-semibold text-gray-600 mb-4">
            Template Editing Not Available
          </h2>
          <p className="text-gray-500">
            You don't have permission to edit templates.
          </p>
        </div>
      </div>
    );
  }

  const handleSave = async (updatedTemplate: StoryTemplate) => {
    try {
      Logger.UI.log(
        `Saving template with ID: ${updatedTemplate.id}`,
        updatedTemplate
      );

      // Create the update request
      const updateRequest: UpdateTemplateRequest = {
        id: updatedTemplate.id,
        template: updatedTemplate,
      };

      // Call the API - using the shared templateApi
      await templateApi.updateTemplate(updateRequest.id, updateRequest);

      // No redirect after saving - stay on the editor page
    } catch (error) {
      Logger.UI.error("Failed to save template", error);
      // Error will be handled by the form component
      throw error;
    }
  };

  return (
    <TemplateForm
      initialTemplate={template}
      onSave={handleSave}
      canPublish={false} // Users can't publish templates
      canSetWelcomeScreen={false} // Users can't set welcome screen
      canManageTags={true}
      canGenerateImages={
        user?.permissions?.includes("templates_images") || false
      }
    />
  );
};
