import { LoaderFunctionArgs } from "react-router-dom";
import { Logger } from "../../shared/logger";
import { templateApi } from "../../shared/apiClient";
import { StoryTemplate } from "core/types";
import { groupTagsByCategories } from "../../shared/tagCategories";

interface LibraryLoaderData {
  templates: StoryTemplate[];
  tagCategories?: Record<string, string[]>;
  initialTags?: string[];
  initialPlayerCount?: number | null;
}

/**
 * Loader for the library page and welcome screen
 * Fetches template data and processes URL parameters
 * For welcome screen (path: "/"), only returns templates without tag processing
 */
export async function libraryLoader({
  request,
}: LoaderFunctionArgs): Promise<LibraryLoaderData> {
  const url = new URL(request.url);
  const isWelcomeScreen = url.pathname === "/";
  const tagsParam = url.searchParams.get("tags");
  const playersParam = url.searchParams.get("players");

  // Log page visit with params for analytics
  // Logger.App.log(
  //   `Visited ${isWelcomeScreen ? "welcome" : "library"} page with tags: ${
  //     tagsParam || "none"
  //   }, players: ${playersParam || "any"}`
  // );

  try {
    // Fetch templates based on context
    const templates = (await templateApi.getTemplates(
      isWelcomeScreen
    )) as StoryTemplate[];

    Logger.App.log(
      `Loaded ${templates.length} templates for ${
        isWelcomeScreen ? "welcome screen" : "library"
      }`
    );

    // For welcome screen, just return templates
    if (isWelcomeScreen) {
      return { templates };
    }

    // For library page, process tags and other data
    const uniqueTags = new Set<string>();
    templates.forEach((template: StoryTemplate) => {
      if (template.tags) {
        template.tags.forEach((tag) => uniqueTags.add(tag));
      }
    });

    const allTagsArray = Array.from(uniqueTags).sort();
    const tagCategories = groupTagsByCategories(allTagsArray);

    return {
      templates,
      tagCategories,
      initialTags: tagsParam ? tagsParam.split(",") : [],
      initialPlayerCount: playersParam ? parseInt(playersParam, 10) : null,
    };
  } catch (error) {
    Logger.App.error("Failed to load templates", error);

    // Return appropriate empty structure based on context
    return isWelcomeScreen
      ? { templates: [] }
      : {
          templates: [],
          tagCategories: {},
          initialTags: tagsParam ? tagsParam.split(",") : [],
          initialPlayerCount: playersParam ? parseInt(playersParam, 10) : null,
        };
  }
}
