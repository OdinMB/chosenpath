import { useLoaderData, useNavigate } from "react-router-dom";
import { TemplateOverview } from "resources/templates/TemplateOverview.js";
import { createDefaultTemplate } from "resources/templates/utils/templateFactory.js";
import { Logger } from "shared/logger.js";
import { templateApi } from "resources/templates/templateApi.js";
import { TemplateMetadata } from "core/types";
import { useAuth } from "client/shared/auth/useAuth.js";
import { useState } from "react";
import { config } from "client/config.js";
import { ImageCard } from "shared/components/ImageCard";

/**
 * User template list component for users with templates_create permission
 */
export const UserTemplateList = () => {
  const { templates: initialTemplates } = useLoaderData() as {
    templates: TemplateMetadata[];
  };
  const [templates, setTemplates] =
    useState<TemplateMetadata[]>(initialTemplates);
  const navigate = useNavigate();
  const { user, isLoading } = useAuth();

  // Check if user has templates_create permission
  const hasTemplateCreatePermission =
    user?.permissions?.includes("templates_create") || false;

  // User-specific handlers
  const handleEdit = (templateId: string) => {
    // Scroll to top before navigating to ensure the edit view starts at the top
    window.scrollTo(0, 0);
    navigate(`/users/my-worlds/${templateId}`);
  };

  const handleDelete = async (templateId: string) => {
    try {
      await templateApi.deleteTemplate(templateId);
      // Remove the deleted template from local state for immediate UI update
      setTemplates((prevTemplates) =>
        prevTemplates.filter((template) => template.id !== templateId)
      );
      Logger.UI.log(`Successfully deleted template: ${templateId}`);
    } catch (error) {
      Logger.UI.error(`Failed to delete template: ${templateId}`, error);
      throw error; // Re-throw so the TemplateOverview can handle the error display
    }
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
            World Creation Not Available
          </h2>
          <p className="text-gray-500">
            You don't have permission to create or manage Worlds.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <ImageCard
        publicImagePath="/hat.jpeg"
        title="Worldbuilding Academy"
        className="mb-6 max-w-sm sm:max-w-md mx-auto"
      >
        <div className="text-sm sm:text-lg text-gray-700">
          Learn how to create Worlds in our{" "}
          <a
            href="/academy"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-blue-600 hover:text-blue-800 underline"
          >
            Worldbuilding Academy
          </a>
          . Join our{" "}
          <a
            href={config.discordUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-blue-600 hover:text-blue-800 underline"
          >
            Discord
          </a>{" "}
          to meet other students.
        </div>
      </ImageCard>

      <TemplateOverview
        initialTemplates={templates}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onCreateNew={handleCreateNew}
        canPublish={false} // Users can't publish templates
        canExportAll={true}
        canImport={true}
      />
    </div>
  );
};
