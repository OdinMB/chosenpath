import { LoaderFunction /*, LoaderFunctionArgs */ } from "react-router-dom";
import { usersApi } from "./usersApi";
import { ExtendedStoryMetadata } from "core/types/api";
import { Logger } from "shared/logger";

export const userStoriesLoader: LoaderFunction<
  ExtendedStoryMetadata[]
> = async () => {
  Logger.App.log("Executing userStoriesLoader");
  try {
    const stories = await usersApi.getAllUserStories();
    Logger.App.log(`userStoriesLoader fetched ${stories.length} stories`);
    return stories;
  } catch (error) {
    Logger.App.error("Error in userStoriesLoader:", error);
    // Re-throw the error to be caught by the UsersErrorBoundary
    // Or, you could return a specific error object/response that your component handles
    throw error;
  }
};
