import { StoryTemplate, TemplateMetadata } from "core/types";
import { templateApi } from "../templateApi";
import { Logger } from "shared/logger";

/**
 * Loader for a single template with full content (for editing)
 * Uses the /templates/full/:id endpoint which requires edit access
 */
export async function templateLoader(templateId: string): Promise<{
  template: StoryTemplate | null;
}> {
  try {
    Logger.App.log(`Loading full template content for ${templateId}`);
    const template = await templateApi.getTemplate(templateId);
    Logger.App.log(`Loaded full template: ${template.title}`);
    return { template };
  } catch (error) {
    Logger.App.error(`Failed to load full template ${templateId}`, error);
    return { template: null };
  }
}

/**
 * Loader for template metadata (public access)
 * Uses the /templates/:id endpoint for basic template information
 * Note: This returns metadata only, not full template content
 */
export async function playableTemplateLoader(templateId: string): Promise<{
  template: TemplateMetadata | null;
}> {
  try {
    Logger.App.log(`Loading template metadata ${templateId}`);
    const template = await templateApi.getTemplateMetadata(templateId);
    Logger.App.log(`Loaded template metadata: ${template.title}`);
    return { template };
  } catch (error) {
    Logger.App.error(`Failed to load template metadata ${templateId}`, error);
    return { template: null };
  }
}

/**
 * Loader for template configuration (metadata + configuration options)
 * Uses metadata endpoint which now includes difficulty levels
 */
export async function configurableTemplateLoader(templateId: string): Promise<{
  template: TemplateMetadata | null;
}> {
  try {
    Logger.App.log(`Loading configurable template data for ${templateId}`);

    // Get metadata (now includes difficulty levels)
    const metadata = await templateApi.getTemplateMetadata(templateId);

    Logger.App.log(
      `Loaded configurable template: ${metadata.title} with ${
        metadata.difficultyLevels?.length || 0
      } difficulty levels`
    );
    return { template: metadata };
  } catch (error) {
    Logger.App.error(
      `Failed to load configurable template ${templateId}`,
      error
    );
    return { template: null };
  }
}
