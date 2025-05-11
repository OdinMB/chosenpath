import { LoaderFunction } from "react-router-dom";
import { templateApi } from "shared/apiClient";
import { Logger } from "shared/logger";
import { StoryTemplate } from "core/types";

/**
 * Loader for the template configuration page
 * Loads a template by ID for configuration
 */
export const templateConfigLoader: LoaderFunction = async ({ params }) => {
  const templateId = params.id;

  if (!templateId) {
    throw new Error("Template ID is required");
  }

  try {
    Logger.App.log(`Loading template for configuration: ${templateId}`);

    // Fetch the template by ID
    const template = (await templateApi.getTemplate(
      templateId
    )) as StoryTemplate;

    if (!template) {
      throw new Error("Template not found");
    }

    Logger.App.log(`Successfully loaded template: ${template.title}`);

    return { template };
  } catch (error) {
    Logger.App.error(`Failed to load template ${templateId}`, error);
    throw error;
  }
};
