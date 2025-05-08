import { useState, useEffect, useCallback } from "react";
import { userStoriesApi } from "shared/apiClient";
import { useAuth } from "shared/useAuth";
import { UserStoryCodeAssociation, StoryMetadata } from "core/types/api";
import { Logger } from "shared/logger";

export function useUserStories() {
  const { isAuthenticated } = useAuth();
  const [isLoadingCodes, setIsLoadingCodes] = useState(false);
  const [isLoadingStories, setIsLoadingStories] = useState(false);
  const [storyCodes, setStoryCodes] = useState<UserStoryCodeAssociation[]>([]);
  const [stories, setStories] = useState<StoryMetadata[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Load story codes associated with the current user
  const loadStoryCodes = useCallback(async () => {
    if (!isAuthenticated) {
      setStoryCodes([]);
      return;
    }

    try {
      setIsLoadingCodes(true);
      setError(null);
      const response = await userStoriesApi.getStoryCodes();
      setStoryCodes(response.data.storyCodes);
    } catch (err) {
      Logger.App.error("Failed to load user story codes", err);
      setError("Failed to load your story codes. Please try again later.");
    } finally {
      setIsLoadingCodes(false);
    }
  }, [isAuthenticated]);

  // Load stories created by the current user
  const loadStories = useCallback(async () => {
    if (!isAuthenticated) {
      setStories([]);
      return;
    }

    try {
      setIsLoadingStories(true);
      setError(null);
      const response = await userStoriesApi.getUserStories();
      setStories(response.data.stories);
    } catch (err) {
      Logger.App.error("Failed to load user stories", err);
      setError("Failed to load your stories. Please try again later.");
    } finally {
      setIsLoadingStories(false);
    }
  }, [isAuthenticated]);

  // Associate a story code with the current user
  const associateStoryCode = useCallback(
    async (storyId: string, playerSlot: string, code: string) => {
      if (!isAuthenticated) {
        return null;
      }

      try {
        setError(null);
        const response = await userStoriesApi.associateStoryCode({
          storyId,
          playerSlot,
          code,
        });

        // Reload story codes after association
        await loadStoryCodes();

        return response.data.storyCode;
      } catch (err) {
        Logger.App.error("Failed to associate story code", err);
        setError("Failed to save your story code. Please try again later.");
        return null;
      }
    },
    [isAuthenticated, loadStoryCodes]
  );

  // Load story codes and stories when authentication changes
  useEffect(() => {
    if (isAuthenticated) {
      loadStoryCodes();
      loadStories();
    }
  }, [isAuthenticated, loadStoryCodes, loadStories]);

  return {
    storyCodes,
    stories,
    isLoadingCodes,
    isLoadingStories,
    error,
    loadStoryCodes,
    loadStories,
    associateStoryCode,
  };
}
