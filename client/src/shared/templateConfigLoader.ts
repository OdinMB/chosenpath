import { LoaderFunction } from "react-router-dom";
import { apiClient } from "./apiClient";
import { Logger } from "./logger";

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
    const response = await apiClient.get(`/templates/${templateId}`);
    const template = response.data.template;

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
