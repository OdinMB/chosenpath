import { LoaderFunctionArgs } from "react-router-dom";
import { StoryTemplate } from "core/types";
import { templateApi } from "../templateApi";
import { Logger } from "shared/logger";

/**
 * Loader for fetching a single template
 * @param mode "normal" (default) for templates with access check, "playable" for public/shared access
 */
export async function templateLoader(
  { params }: LoaderFunctionArgs,
  { mode = "normal" }: { mode?: "normal" | "playable" } = {}
): Promise<{
  template: StoryTemplate;
}> {
  const templateId = params.id;
  if (!templateId) {
    Logger.App.error("Template ID is required");
    throw new Response("Template ID is required", { status: 400 });
  }

  try {
    let template: StoryTemplate;

    if (mode === "playable") {
      // Playable mode doesn't require authentication, used for public access
      template = await templateApi.getPlayableTemplate(templateId);
      Logger.App.log(`Loaded playable template: ${template.title}`);
    } else {
      // Normal mode requires appropriate access permissions
      template = await templateApi.getTemplate(templateId);
      Logger.App.log(
        `Loaded template with ID ${templateId}: ${template.title}`
      );
    }

    return { template };
  } catch (error) {
    Logger.App.error(`Failed to load template with ID ${templateId}`, error);
    throw new Response("Template not found or you don't have access", {
      status: 404,
    });
  }
}
