import { useState, useCallback } from "react";
import { SessionContext } from "./SessionContext.js";
import {
  getStoredCodeSets,
  removeCodeSetFromStorage,
  getAllUniqueCodesFromStorage,
} from "./utils/codeSetUtils.js";
import {
  ExtendedStoryMetadata,
  // GetUserStoryFeedResponse, // Removed as it's not directly used now
} from "core/types/api.js";
import { userStoriesApi } from "./apiClient.js";
import { Logger } from "./logger.js";

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [storedCodeSets, setStoredCodeSets] = useState<string[][]>(
    getStoredCodeSets()
  );
  const [storyFeed, setStoryFeed] = useState<
    Record<string, ExtendedStoryMetadata>
  >({});

  const refreshStoredCodeSets = useCallback(() => {
    setStoredCodeSets(getStoredCodeSets());
    Logger.App.log("Refreshed stored code sets from localStorage.");
  }, []);

  const fetchStoryFeed = useCallback(async () => {
    setIsLoading(true);

    const uniqueLocalPlayerCodes = getAllUniqueCodesFromStorage();

    try {
      const feedResponse = await userStoriesApi.getUserStoryFeed(
        uniqueLocalPlayerCodes.length > 0 ? uniqueLocalPlayerCodes : undefined
      );

      if (feedResponse && feedResponse.stories) {
        const feed: Record<string, ExtendedStoryMetadata> = {};
        feedResponse.stories.forEach((story: ExtendedStoryMetadata) => {
          feed[story.id] = story;
        });
        setStoryFeed(feed);
      } else {
        Logger.App.warn(
          "No stories array found in feed response or invalid response structure",
          feedResponse
        );
        setStoryFeed({});
      }
    } catch (error) {
      Logger.App.error("Failed to fetch story feed", error);
      setStoryFeed({});
    } finally {
      setIsLoading(false);
    }
  }, [setIsLoading]);

  const clearStoryFeed = useCallback(() => {
    setStoryFeed({});
    Logger.App.info("Story feed cleared.");
  }, []);

  const value = {
    sessionId,
    setSessionId,
    isLoading,
    setIsLoading,
    storedCodeSets,
    refreshStoredCodeSets,
    deleteCodeSet: (codeSetToRemove: string[]) => {
      removeCodeSetFromStorage(codeSetToRemove);
      refreshStoredCodeSets();
    },
    storyFeed,
    fetchStoryFeed,
    clearStoryFeed,
  };

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}
