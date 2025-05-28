import { TemplateMetadata } from "core/types";
import { templateApi } from "../templateApi";
import { Logger } from "shared/logger";

type TemplateContext = "admin" | "user" | "published";

interface TemplatesLoaderOptions {
  context: TemplateContext;
  forWelcomeScreen?: boolean;
  userId?: string;
}

/**
 * Unified loader for template metadata that can be used in different contexts
 * All contexts now return metadata by default for security and performance
 */
export async function templatesLoader({
  context = "published",
  forWelcomeScreen = false,
  userId,
}: TemplatesLoaderOptions): Promise<{
  templates: TemplateMetadata[];
}> {
  try {
    let templates: TemplateMetadata[] = [];

    switch (context) {
      case "admin":
        // Admin context - get all template metadata
        templates = await templateApi.getAllTemplateMetadata();
        Logger.App.log(`Admin: Loaded ${templates.length} template metadata`);
        break;

      case "user":
        // User context - get template metadata for the current user or a specific user
        if (userId) {
          templates = await templateApi.getUserTemplateMetadataByUserId(userId);
          Logger.App.log(
            `User: Loaded ${templates.length} template metadata for user ${userId}`
          );
        } else {
          templates = await templateApi.getUserTemplateMetadata();
          Logger.App.log(
            `User: Loaded ${templates.length} template metadata for current user`
          );
        }
        break;

      case "published":
      default:
        // Public context - only published template metadata
        templates = await templateApi.getPublishedTemplateMetadata(
          forWelcomeScreen
        );
        Logger.App.log(
          `Public: Loaded ${templates.length} published template metadata${
            forWelcomeScreen ? " for welcome screen" : ""
          }`
        );
        break;
    }

    return { templates };
  } catch (error) {
    Logger.App.error(
      `Failed to load template metadata in ${context} context`,
      error
    );
    return { templates: [] };
  }
}
