import { templateApi } from "resources/templates/templateApi.js";
import { Logger } from "shared/logger.js";

/**
 * Loader for user template metadata - fetches template metadata created by the current user
 */
export const userTemplatesLoader = async () => {
  try {
    Logger.UI.log("Loading user template metadata");
    const templates = await templateApi.getUserTemplateMetadata();
    Logger.UI.log(`Loaded ${templates.length} user template metadata`);
    return { templates };
  } catch (error) {
    Logger.UI.error("Failed to load user template metadata", error);
    throw error;
  }
};
