import { LoaderFunctionArgs } from "react-router-dom";
import { Logger } from "../../shared/logger";
import { TemplateMetadata } from "core/types";
import { groupTagsByCategories } from "../../resources/templates/tagCategories";
import { templateCache } from "../../resources/templates/templateCache";

interface LibraryLoaderData {
  templates: TemplateMetadata[];
  tagCategories: Record<string, string[]>;
  initialTags: string[];
  initialPlayerCount: number | null;
}

/**
 * Loader for the library page and welcome screen
 * Fetches template metadata and processes URL parameters
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
    // Fetch template metadata using cache
    const templates = await templateCache.getPublishedTemplates(
      isWelcomeScreen
    );

    Logger.App.log(
      `Loaded ${templates.length} template metadata for ${
        isWelcomeScreen ? "welcome screen" : "library"
      }`
    );

    // For welcome screen, just return templates
    if (isWelcomeScreen) {
      return {
        templates,
        tagCategories: {},
        initialTags: [],
        initialPlayerCount: null,
      };
    }

    // For library page, process tags and other data
    const uniqueTags = new Set<string>();
    templates.forEach((template: TemplateMetadata) => {
      if (template.tags) {
        template.tags.forEach((tag) => uniqueTags.add(tag));
      }
    });

    const allTagsArray = Array.from(uniqueTags).sort();
    const tagCategories = groupTagsByCategories(allTagsArray);

    // Parse tags from URL parameter, ensuring they exist in the list of available tags
    const initialTags = tagsParam
      ? tagsParam.split(",").filter((tag) => uniqueTags.has(tag))
      : [];

    Logger.App.log(
      `Parsed ${initialTags.length} valid tags from URL: ${initialTags.join(
        ", "
      )}`
    );

    // Parse player count from URL parameter
    const initialPlayerCount = playersParam
      ? isNaN(parseInt(playersParam, 10))
        ? null
        : parseInt(playersParam, 10)
      : null;

    return {
      templates,
      tagCategories,
      initialTags,
      initialPlayerCount,
    };
  } catch (error) {
    Logger.App.error("Failed to load template metadata", error);

    // Return appropriate empty structure based on context
    return isWelcomeScreen
      ? {
          templates: [],
          tagCategories: {},
          initialTags: [],
          initialPlayerCount: null,
        }
      : {
          templates: [],
          tagCategories: {},
          initialTags: [],
          initialPlayerCount: playersParam
            ? isNaN(parseInt(playersParam, 10))
              ? null
              : parseInt(playersParam, 10)
            : null,
        };
  }
}
