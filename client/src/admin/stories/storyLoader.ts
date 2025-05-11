import { adminStoryApi } from "../adminApi";
import { StoriesListItem } from "core/types";

export async function storyLoader(): Promise<StoriesListItem[]> {
  const response = await adminStoryApi.getStories();
  return response;
}
