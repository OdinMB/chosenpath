import { adminStoryApi } from "../adminApi.js";
// import { StoriesListItem } from "core/types"; // Remove old import
import { AdminStoriesListItem } from "core/types/story.js"; // Import the correct type
import { Logger } from "shared/logger";

export async function adminStoryLoader(): Promise<AdminStoriesListItem[]> {
  // Update return type
  try {
    const stories = await adminStoryApi.getStories(); // This now correctly returns AdminStoriesListItem[]
    return stories;
  } catch (error) {
    Logger.Admin.error("Failed to load stories", error);
    throw error; // Let React Router handle the error
  }
}
