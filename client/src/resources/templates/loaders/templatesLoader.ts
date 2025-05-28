import { StoryTemplate } from "core/types";
import { templateApi } from "../templateApi";
import { Logger } from "shared/logger";

type TemplateContext = "admin" | "user" | "published";

interface TemplatesLoaderOptions {
  context: TemplateContext;
  forWelcomeScreen?: boolean;
  userId?: string;
}

/**
 * Unified loader for templates that can be used in different contexts
 */
export async function templatesLoader({
  context = "published",
  forWelcomeScreen = false,
  userId,
}: TemplatesLoaderOptions): Promise<{
  templates: StoryTemplate[];
}> {
  try {
    let templates: StoryTemplate[] = [];

    switch (context) {
      case "admin":
        // Admin context - get all templates with full control
        templates = await templateApi.getAllTemplates();
        Logger.App.log(`Admin: Loaded ${templates.length} templates`);
        break;

      case "user":
        // User context - get templates for the current user or a specific user
        if (userId) {
          templates = await templateApi.getUserTemplatesByUserId(userId);
          Logger.App.log(
            `User: Loaded ${templates.length} templates for user ${userId}`
          );
        } else {
          templates = await templateApi.getUserTemplates();
          Logger.App.log(
            `User: Loaded ${templates.length} templates for current user`
          );
        }
        break;

      case "published":
      default:
        // Public context - only published templates
        templates = await templateApi.getPublishedTemplates(forWelcomeScreen);
        Logger.App.log(
          `Public: Loaded ${templates.length} published templates${
            forWelcomeScreen ? " for welcome screen" : ""
          }`
        );
        break;
    }

    return { templates };
  } catch (error) {
    Logger.App.error(`Failed to load templates in ${context} context`, error);
    return { templates: [] };
  }
}
