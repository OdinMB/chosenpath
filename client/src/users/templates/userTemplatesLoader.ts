import { templateApi } from "resources/templates/templateApi.js";
import { Logger } from "shared/logger.js";

/**
 * Loader for user templates - fetches templates created by the current user
 */
export const userTemplatesLoader = async () => {
  try {
    Logger.UI.log("Loading user templates");
    const templates = await templateApi.getUserTemplates();
    Logger.UI.log(`Loaded ${templates.length} user templates`);
    return { templates };
  } catch (error) {
    Logger.UI.error("Failed to load user templates", error);
    throw error;
  }
};
