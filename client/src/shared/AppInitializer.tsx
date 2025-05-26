import { useEffect, useRef, useCallback } from "react";
import { useAuth } from "client/shared/auth/useAuth";
import { useSession } from "client/shared/session/useSession";
import { Logger } from "shared/logger";
import { MULTIPLAYER_STORY_CHECK_INTERVAL_MS } from "core/config";

/**
 * AppInitializer component is responsible for orchestrating initial data loading
 * and reacting to authentication or session changes to refresh data like the story feed.
 * It does not render any UI itself.
 */
export const AppInitializer: React.FC = () => {
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const {
    fetchStoryFeed,
    clearStoryFeed,
    storedCodeSets,
    storyFeed,
    isLoading: isSessionLoading,
  } = useSession();

  const prevIsAuthenticatedRef = useRef<boolean | undefined>(undefined);
  const prevUserIdRef = useRef<string | undefined | null>(undefined);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const getStoredCodesKey = useCallback(
    (codes: string[][]) => JSON.stringify(codes),
    []
  );
  const prevStoredCodesKeyRef = useRef<string>(getStoredCodesKey([])); // Initialize with empty array key

  const initialLoadOrAuthProcessedRef = useRef(false); // Renamed for clarity

  useEffect(() => {
    const currentStoredCodesKey = getStoredCodesKey(storedCodeSets);

    // Only proceed if authentication status is settled.
    // SessionProvider's own isLoading state will manage its loading status.
    if (isAuthLoading) {
      Logger.App.debug("AppInitializer: Auth is loading, deferring decisions.");
      return;
    }

    // 1. Initial load / Authentication status first confirmed
    if (!initialLoadOrAuthProcessedRef.current) {
      if (isAuthenticated) {
        fetchStoryFeed();
      } else if (storedCodeSets.length > 0) {
        fetchStoryFeed();
      } else {
        // When there's no auth user and no stored codes, explicitly set isLoading to false
        Logger.App.debug(
          "AppInitializer: No auth user and no stored codes, nothing to fetch."
        );
        clearStoryFeed();
      }
      initialLoadOrAuthProcessedRef.current = true;
    }
    // 2. User logs in (was not authenticated, now is)
    else if (isAuthenticated && !prevIsAuthenticatedRef.current) {
      Logger.App.info(
        "AppInitializer: User logged in. Preparing to fetch story feed."
      );
      fetchStoryFeed();
    }
    // 3. User logs out (was authenticated, now is not)
    else if (!isAuthenticated && prevIsAuthenticatedRef.current) {
      Logger.App.info("AppInitializer: User logged out. Clearing story feed.");
      clearStoryFeed();
      if (storedCodeSets.length > 0) {
        Logger.App.info(
          "AppInitializer: User logged out, local codes exist. Preparing to fetch feed for local codes."
        );
        fetchStoryFeed();
      }
    }
    // 4. Authenticated user identity changes (different user)
    else if (
      isAuthenticated &&
      user?.id !== prevUserIdRef.current &&
      prevUserIdRef.current !== undefined // Ensure it's not the initial undefined state
    ) {
      Logger.App.info(
        "AppInitializer: Authenticated user changed. Preparing to fetch story feed."
      );
      fetchStoryFeed();
    }
    // 5. Local story codes change (different set of codes)
    // This should ideally be the last check or a distinct effect if it can overlap without issues.
    else if (currentStoredCodesKey !== prevStoredCodesKeyRef.current) {
      Logger.App.info(
        "AppInitializer: Stored codes changed. Preparing to fetch story feed."
      );
      fetchStoryFeed();
    }

    // Update refs for the next render cycle
    prevIsAuthenticatedRef.current = isAuthenticated;
    prevUserIdRef.current = user?.id;
    prevStoredCodesKeyRef.current = currentStoredCodesKey;
  }, [
    isAuthenticated,
    user, // user?.id is used
    storedCodeSets,
    fetchStoryFeed,
    clearStoryFeed,
    isAuthLoading,
    isSessionLoading,
    getStoredCodesKey, // useCallback ensures stable reference
    // storyFeed removed as it's not directly driving decisions here anymore
  ]);

  // Setup polling for multiplayer stories where user is waiting
  useEffect(() => {
    // Helper to check if user is waiting in any multiplayer stories
    const isWaitingInMultiplayerStory = () => {
      if (!storyFeed || Object.keys(storyFeed).length === 0) return false;

      return Object.values(storyFeed).some((story) => {
        // Check if it's a multiplayer story (more than one player)
        if (!story.players || story.players.length <= 1) return false;

        // Find current user's player entry
        const currentUserEntry = story.players.find(
          (player) => player.isCurrentUser
        );
        if (!currentUserEntry) return false;

        // Check if user is in the story but not pending (waiting for others)
        return !currentUserEntry.isPending;
      });
    };

    // Clear any existing interval
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }

    // If user is waiting in multiplayer stories, set up polling
    if (isWaitingInMultiplayerStory()) {
      Logger.App.info(
        "AppInitializer: User is waiting in multiplayer stories. Setting up polling."
      );
      pollingIntervalRef.current = setInterval(() => {
        Logger.App.debug("AppInitializer: Polling for story feed updates.");
        fetchStoryFeed();
      }, MULTIPLAYER_STORY_CHECK_INTERVAL_MS);
    }

    // Cleanup function
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [storyFeed, fetchStoryFeed]);

  return null;
};
