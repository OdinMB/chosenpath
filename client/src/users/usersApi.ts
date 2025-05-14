import { userStoriesApi } from "shared/apiClient";
import {
  ExtendedStoryMetadata,
  AssociateStoryCodeRequest,
  UserStoryCodeAssociation,
} from "core/types/api";
import { Logger } from "shared/logger";

export const usersApi = {
  getAllUserStories: async (): Promise<ExtendedStoryMetadata[]> => {
    Logger.App.log("Fetching all user related stories via usersApi");
    try {
      // apiClient.get unwraps the .data property from SuccessResponse<T>
      // userStoriesApi.getAllUserStories() calls apiClient.get<UserStoriesResponse>
      // So, the 'response' here is UserStoriesResponse (i.e., { stories: ExtendedStoryMetadata[] | StoryMetadata[] })
      const response = await userStoriesApi.getAllUserStories();
      Logger.App.log(
        `Successfully fetched ${response.stories.length} user related stories`
      );
      // The server route /users/all-stories is guaranteed to return ExtendedStoryMetadata[]
      return response.stories as ExtendedStoryMetadata[];
    } catch (error) {
      Logger.App.error(
        "Failed to fetch all user related stories via usersApi",
        error
      );
      throw error;
    }
  },

  getStoryCodes: async (): Promise<UserStoryCodeAssociation[]> => {
    Logger.App.log("Fetching user story codes via usersApi");
    try {
      // Similar to above, response is UserStoryCodesResponse (i.e. { storyCodes: UserStoryCodeAssociation[] })
      const response = await userStoriesApi.getStoryCodes();
      Logger.App.log(
        `Successfully fetched ${response.storyCodes.length} story codes`
      );
      return response.storyCodes;
    } catch (error) {
      Logger.App.error("Failed to fetch story codes via usersApi", error);
      throw error;
    }
  },

  associateStoryCode: async (
    request: AssociateStoryCodeRequest
  ): Promise<UserStoryCodeAssociation> => {
    Logger.App.log("Associating story code via usersApi", request);
    try {
      // userStoriesApi.associateStoryCode calls apiClient.post() which returns T (the .data part of SuccessResponse<T>)
      // The server returns SuccessResponse<{ storyCode: UserStoryCodeAssociation }>
      // So, apiClient.post will return { storyCode: UserStoryCodeAssociation }
      const response = (await userStoriesApi.associateStoryCode(request)) as {
        storyCode: UserStoryCodeAssociation;
      };
      Logger.App.log("Successfully associated story code");
      return response.storyCode;
    } catch (error) {
      Logger.App.error("Failed to associate story code via usersApi", error);
      throw error;
    }
  },
};
