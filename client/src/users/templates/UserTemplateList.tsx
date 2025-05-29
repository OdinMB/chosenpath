import { useLoaderData, useNavigate } from "react-router-dom";
import { TemplateOverview } from "resources/templates/TemplateOverview.js";
import { createDefaultTemplate } from "resources/templates/utils/templateFactory.js";
import { Logger } from "shared/logger.js";
import { templateApi } from "resources/templates/templateApi.js";
import { TemplateMetadata } from "core/types";
import { useAuth } from "client/shared/auth/useAuth.js";
import { useState } from "react";
import { DiscordButton } from "client/shared/components/DiscordButton.js";

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
    <div className="container mx-auto p-4">
      {/* Introduction Videos Announcement */}
      <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            <svg
              className="h-5 w-5 text-blue-400 mt-0.5"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-blue-800">
              Learn how to create and tweak story environments
            </h3>
            <div className="mt-2 text-sm text-blue-700">
              <div className="space-y-1">
                <div>
                  <a
                    href="https://www.loom.com/share/1b12f539294f441a9ca3209de5467b9a"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-blue-600 hover:text-blue-800 underline"
                  >
                    Part 1/2: (Playing Your Story, Guidelines, Media, Story
                    Elements)
                  </a>
                </div>
                <div>
                  <a
                    href="https://www.loom.com/share/b350dbd863d2475c880723515807812a"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-blue-600 hover:text-blue-800 underline"
                  >
                    Part 2/2: (Switches/Threads/Outcomes, Players, AI Features)
                  </a>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm text-blue-700 mt-3">
                <span>You have questions? Join our Discord!</span>
                <DiscordButton
                  variant="outline"
                  showText={true}
                  className="ml-4"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

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
