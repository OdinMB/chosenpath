import { useState, useEffect, useCallback, useRef } from "react";
import { userStoriesApi } from "shared/apiClient";
import { useAuth } from "shared/useAuth";
import {
  UserStoryCodeAssociation,
  StoryMetadata,
  ExtendedStoryMetadata,
} from "core/types/api";
import { Logger } from "shared/logger";

export function useUserStories() {
  const { isAuthenticated, user } = useAuth();
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

        // Get all stories related to the user
        const storiesResponse = await userStoriesApi.getAllUserStories();
        const userStories = storiesResponse.data.stories;

        // Check if stories are extended with player data
        const extendedStories = userStories as ExtendedStoryMetadata[];

        // Extract player data if available
        const extractedCodes: UserStoryCodeAssociation[] = [];
        const hasPlayers =
          extendedStories.length > 0 && "players" in extendedStories[0];

        if (hasPlayers) {
          // Current user ID
          const currentUserId = user?.id || "";

          // Convert player entries to code associations for backward compatibility
          extendedStories.forEach((story) => {
            if (story.players) {
              // For each player entry, check if it should be included
              story.players.forEach((player) => {
                // Include all player entries for stories created by the user,
                // or only those with a userId matching the current user for other stories
                const isUserCreated = story.creatorId === currentUserId;
                if (isUserCreated || player.userId === currentUserId) {
                  extractedCodes.push({
                    userId: player.userId || "", // Empty string for null userId
                    storyId: player.storyId,
                    playerSlot: player.playerSlot,
                    code: player.code,
                    createdAt: story.createdAt,
                    lastPlayedAt: player.lastPlayedAt || story.updatedAt,
                  });
                }
              });
            }
          });

          setStoryCodes(extractedCodes);
          Logger.App.log("Using players data from extended stories");
        } else {
          // If not extended, get codes separately
          const codesResponse = await userStoriesApi.getStoryCodes();
          const userCodes = codesResponse.data.storyCodes;
          setStoryCodes(userCodes);
        }

        // Store the stories (remove players property for consistent typing)
        const cleanStories: StoryMetadata[] = userStories.map((story) => {
          // If this is an extended story, create a new object without the players property
          if ("players" in story) {
            // Manually create a new object with only the desired properties
            return {
              id: story.id,
              title: story.title,
              templateId: story.templateId,
              createdAt: story.createdAt,
              updatedAt: story.updatedAt,
              maxTurns: story.maxTurns,
              generateImages: story.generateImages,
              creatorId: story.creatorId,
            };
          }
          return story as StoryMetadata;
        });

        setStories(cleanStories);

        Logger.App.log("Loaded user story data", {
          stories: cleanStories.length,
          codes: hasPlayers ? extractedCodes.length : "from separate API call",
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
    [isAuthenticated, user]
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
