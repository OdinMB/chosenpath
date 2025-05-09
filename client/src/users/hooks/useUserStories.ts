import { useState, useEffect, useCallback, useRef } from "react";
import { userStoriesApi } from "shared/apiClient";
import { useAuth } from "shared/useAuth";
import { UserStoryCodeAssociation, StoryMetadata } from "core/types/api";
import { Logger } from "shared/logger";

export function useUserStories() {
  const { isAuthenticated } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [storyCodes, setStoryCodes] = useState<UserStoryCodeAssociation[]>([]);
  const [stories, setStories] = useState<StoryMetadata[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Use refs to track ongoing requests to prevent duplicate calls
  const loadingRef = useRef(false);
  const shouldReloadRef = useRef(false);

  // Load all user-related data in a single call
  const loadUserStoryData = useCallback(
    async (force = false) => {
      // Skip if not authenticated
      if (!isAuthenticated) {
        setStoryCodes([]);
        setStories([]);
        return;
      }

      // Skip if already loading, but mark for reload after current load finishes
      if (loadingRef.current && !force) {
        shouldReloadRef.current = true;
        return;
      }

      try {
        setIsLoading(true);
        loadingRef.current = true;
        setError(null);

        Logger.App.log("Loading user story data...");

        // First get all stories related to the user
        const storiesResponse = await userStoriesApi.getAllUserStories();
        const userStories = storiesResponse.data.stories;
        setStories(userStories);

        // Get codes if needed
        const codesResponse = await userStoriesApi.getStoryCodes();
        const userCodes = codesResponse.data.storyCodes;
        setStoryCodes(userCodes);

        Logger.App.log("Loaded user story data", {
          stories: userStories.length,
          codes: userCodes.length,
        });
      } catch (err) {
        Logger.App.error("Failed to load user story data", err);
        setError("Failed to load your stories. Please try again later.");
      } finally {
        setIsLoading(false);
        loadingRef.current = false;

        // If a reload was requested while loading, do it now
        if (shouldReloadRef.current) {
          shouldReloadRef.current = false;
          setTimeout(() => loadUserStoryData(true), 0);
        }
      }
    },
    [isAuthenticated]
  );

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

        // Reload all story data after association
        await loadUserStoryData(true);

        return response.data.storyCode;
      } catch (err) {
        Logger.App.error("Failed to associate story code", err);
        setError("Failed to save your story code. Please try again later.");
        return null;
      }
    },
    [isAuthenticated, loadUserStoryData]
  );

  // Load story data when authentication changes
  useEffect(() => {
    if (isAuthenticated) {
      loadUserStoryData();
    }
  }, [isAuthenticated, loadUserStoryData]);

  return {
    storyCodes,
    stories,
    isLoading,
    error,
    loadUserStoryData,
    loadStoryCodes: loadUserStoryData, // For backward compatibility
    loadStories: loadUserStoryData, // For backward compatibility
    associateStoryCode,
  };
}
