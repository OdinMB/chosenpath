import { UserListItem } from "core/types";
import { AdminStoriesListItem } from "core/types/story.js";
import {
  GetAdminStoriesResponseData,
  FeedbackItem,
  ConnectionReport,
  SpendTotals,
  UnreadableAddressCounts,
} from "core/types/api.js";
import { apiClient } from "shared/apiClient";
import { Logger } from "shared/logger";

// Admin Story API functions
export const adminStoryApi = {
  getStories: async (): Promise<AdminStoriesListItem[]> => {
    Logger.Admin.log("Fetching stories from admin API");
    try {
      const response = await apiClient.get<GetAdminStoriesResponseData>(
        `/admin/stories`
      );
      Logger.Admin.log(
        `Successfully fetched ${response.stories.length} stories`
      );
      return response.stories;
    } catch (error) {
      Logger.Admin.error("Failed to fetch stories from admin API", error);
      throw error;
    }
  },

  deleteStory: async (storyId: string): Promise<void> => {
    return apiClient.delete(`/admin/stories/${storyId}`);
  },
};

// Admin Users API functions
export const adminUsersApi = {
  getUsers: async (): Promise<UserListItem[]> => {
    Logger.Admin.log("Fetching users from admin API");
    try {
      const response = await apiClient.get<{ users: UserListItem[] }>(
        `/admin/users`
      );
      Logger.Admin.log(`Successfully fetched ${response.users.length} users`);
      return response.users;
    } catch (error) {
      Logger.Admin.error("Failed to fetch users from admin API", error);
      throw error;
    }
  },

  deleteUser: async (userId: string): Promise<void> => {
    Logger.Admin.log(`Deleting user: ${userId}`);
    try {
      await apiClient.delete(`/admin/users/${userId}`);
      Logger.Admin.log(`Successfully deleted user: ${userId}`);
    } catch (error) {
      Logger.Admin.error(`Failed to delete user: ${userId}`, error);
      throw error;
    }
  },
};

// Admin Feedback API functions
export const adminFeedbackApi = {
  getFeedback: async (): Promise<FeedbackItem[]> => {
    Logger.Admin.log("Fetching feedback from admin API");
    try {
      const response = await apiClient.get<{ feedback: FeedbackItem[] }>(
        `/admin/feedback`
      );
      Logger.Admin.log(
        `Successfully fetched ${response.feedback.length} feedback submissions`
      );
      return response.feedback;
    } catch (error) {
      Logger.Admin.error("Failed to fetch feedback from admin API", error);
      throw error;
    }
  },

  deleteFeedback: async (feedbackId: string): Promise<void> => {
    Logger.Admin.log(`Deleting feedback: ${feedbackId}`);
    try {
      await apiClient.delete(`/admin/feedback/${feedbackId}`);
      Logger.Admin.log(`Successfully deleted feedback: ${feedbackId}`);
    } catch (error) {
      Logger.Admin.error(`Failed to delete feedback: ${feedbackId}`, error);
      throw error;
    }
  },
};

// Admin "System" page: the TRUST_PROXY check and the AI spend totals
export const adminSystemApi = {
  /**
   * How the server sees this browser's request; with `forgedAddress`, sent
   * with that X-Forwarded-For entry, for the TRUST_PROXY verdict
   */
  getConnection: async (forgedAddress?: string): Promise<ConnectionReport> => {
    return apiClient.get<ConnectionReport>(
      "/admin/system/connection",
      forgedAddress
        ? { headers: { "X-Forwarded-For": forgedAddress } }
        : undefined
    );
  },

  /** How many of the server's address reads found no address (counts only) */
  getAddressCounts: async (): Promise<UnreadableAddressCounts> => {
    return apiClient.get<UnreadableAddressCounts>("/admin/system/addresses");
  },

  getSpend: async (): Promise<SpendTotals> => {
    return apiClient.get<SpendTotals>("/admin/system/spend");
  },
};
