import { LoaderFunctionArgs } from "react-router-dom";
import { Logger } from "../../shared/logger";
import { apiClient } from "../../shared/apiClient";
import { StoryTemplate } from "core/types";
import { groupTagsByCategories } from "../../shared/tagCategories";

interface LibraryLoaderData {
  templates: StoryTemplate[];
  tagCategories: Record<string, string[]>;
  initialTags: string[];
  initialPlayerCount: number | null;
}

/**
 * Loader for the library page
 * Fetches template data and processes URL parameters
 */
export async function libraryLoader({
  request,
}: LoaderFunctionArgs): Promise<LibraryLoaderData> {
  const url = new URL(request.url);
  const tagsParam = url.searchParams.get("tags");
  const playersParam = url.searchParams.get("players");

  // Log page visit with params for analytics
  Logger.App.log(
    `Visited library page with tags: ${tagsParam || "none"}, players: ${
      playersParam || "any"
    }`
  );

  try {
    // Fetch all published templates
    const response = await apiClient.get(`/templates`);
    const templates = response.data.templates;

    Logger.App.log(`Loaded ${templates.length} templates for library`);

    // Extract all unique tags
    const uniqueTags = new Set<string>();
    templates.forEach((template: StoryTemplate) => {
      if (template.tags) {
        template.tags.forEach((tag) => uniqueTags.add(tag));
      }
    });

    const allTagsArray = Array.from(uniqueTags).sort();

    // Group tags by categories
    const tagCategories = groupTagsByCategories(allTagsArray);

    return {
      templates,
      tagCategories,
      initialTags: tagsParam ? tagsParam.split(",") : [],
      initialPlayerCount: playersParam ? parseInt(playersParam, 10) : null,
    };
  } catch (error) {
    Logger.App.error("Failed to load templates", error);

    // Still return structure but with empty templates
    return {
      templates: [],
      tagCategories: {},
      initialTags: tagsParam ? tagsParam.split(",") : [],
      initialPlayerCount: playersParam ? parseInt(playersParam, 10) : null,
    };
  }
}
