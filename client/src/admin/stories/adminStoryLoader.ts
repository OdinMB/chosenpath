import { adminStoryApi } from "../adminApi.js";
import { StoriesListItem } from "core/types";
import { Logger } from "shared/logger";

export async function adminStoryLoader(): Promise<StoriesListItem[]> {
  try {
    const stories = await adminStoryApi.getStories();
    return stories;
  } catch (error) {
    Logger.Admin.error("Failed to load stories", error);
    throw error; // Let React Router handle the error
  }
}
