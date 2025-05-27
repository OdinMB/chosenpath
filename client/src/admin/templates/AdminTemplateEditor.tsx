import { useLoaderData, useNavigate } from "react-router-dom";
import { TemplateForm } from "resources/templates/components/TemplateForm.js";
import { StoryTemplate } from "core/types/index.js";
import { Logger } from "shared/logger.js";
import { UpdateTemplateRequest } from "core/types/admin.js";
import { templateApi } from "resources/templates/templateApi.js";

/**
 * Admin wrapper for the template editor component
 * Uses admin-specific template editing logic
 */
export const AdminTemplateEditor = () => {
  // The loader returns { template } so we need to extract it
  const loaderData = useLoaderData() as { template: StoryTemplate };
  const template = loaderData?.template;
  const navigate = useNavigate();

  // Log the template data for debugging
  Logger.Admin.log("Template data loaded:", template);

  if (!template) {
    Logger.Admin.error("Template data not found or invalid format");
    return (
      <div className="p-4">
        Error: Template data not found or invalid format.
      </div>
    );
  }

  const handleSave = async (updatedTemplate: StoryTemplate) => {
    try {
      Logger.Admin.log(
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
      Logger.Admin.error("Failed to save template", error);
      // Error will be handled by the form component
      throw error;
    }
  };

  const handleCancel = () => {
    navigate("/admin/templates");
  };

  return (
    <TemplateForm
      initialTemplate={template}
      onSave={handleSave}
      onCancel={handleCancel}
      canPublish={true}
      canSetWelcomeScreen={true}
      canManageTags={true}
      canGenerateImages={true}
    />
  );
};
