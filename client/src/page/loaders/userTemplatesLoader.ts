import { TemplateMetadata } from "core/types";
import { templateApi } from "../../resources/templates/templateApi";
import { Logger } from "shared/logger";

/**
 * Loader for user template metadata (for browsing/listing)
 */
export async function userTemplatesLoader(): Promise<{
  templates: TemplateMetadata[];
}> {
  try {
    const templates = await templateApi.getUserTemplateMetadata();
    Logger.App.log(`Loaded ${templates.length} user template metadata`);
    return { templates };
  } catch (error) {
    Logger.App.error("Failed to load user template metadata", error);
    return { templates: [] };
  }
}
