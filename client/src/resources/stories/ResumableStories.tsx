import { useEffect, useState, useCallback } from "react";
import { useAuth } from "client/shared/auth/useAuth";
import { useSession } from "client/shared/session/useSession";
import {
  getAllUniqueCodesFromStorage,
  removeCodeSetFromStorage,
} from "shared/utils/codeSetUtils";
import { ExtendedStoryMetadata, StoryPlayerEntry } from "core/types/api";
import { StoryCard } from "../../shared/components/StoryCard";
import { Logger } from "shared/logger";
import { useNavigate } from "react-router-dom";
import { storyApi, userStoriesApi } from "client/shared/apiClient";

interface ResumableStoriesProps {
  onSetHasContent?: (hasContent: boolean) => void;
  forceSingleColumn?: boolean;
  showArchivedOnly?: boolean;
}

export const ResumableStories: React.FC<ResumableStoriesProps> = ({
  onSetHasContent,
  forceSingleColumn,
  showArchivedOnly = false,
}) => {
  const { user, isAuthenticated } = useAuth();
  const {
    storyFeed: activeStoryFeed,
    isLoading: isSessionLoading,
    fetchStoryFeed,
  } = useSession();
  const navigate = useNavigate();

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [displayableStories, setDisplayableStories] = useState<
    ExtendedStoryMetadata[]
  >([]);
  const [archivedStoryFeed, setArchivedStoryFeed] = useState<
    Record<string, ExtendedStoryMetadata>
  >({});

  // Fetch archived stories when showArchivedOnly is true
  const fetchArchivedStories = useCallback(async () => {
    if (!showArchivedOnly || !user) {
      return;
    }

    try {
      setIsLoading(true);
      const feedResponse = await userStoriesApi.getUserStoryFeed(
        undefined, // No local codes for archived stories
        "archived"
      );

      if (feedResponse && feedResponse.stories) {
        const feed: Record<string, ExtendedStoryMetadata> = {};
        feedResponse.stories.forEach((story: ExtendedStoryMetadata) => {
          feed[story.id] = story;
        });
        setArchivedStoryFeed(feed);
      } else {
        setArchivedStoryFeed({});
      }
    } catch (error) {
      Logger.App.error("Failed to fetch archived stories", error);
      setArchivedStoryFeed({});
      setError("Failed to load archived stories. Please try again.");
    }
  }, [showArchivedOnly, user]);

  useEffect(() => {
    if (showArchivedOnly) {
      fetchArchivedStories();
      return;
    }

    if (isSessionLoading) {
      setIsLoading(true);
      return;
    }

    try {
      const allStoriesFromFeed: ExtendedStoryMetadata[] =
        Object.values(activeStoryFeed);

      const allMyUniqueLocalCodes = getAllUniqueCodesFromStorage();

      if (
        allStoriesFromFeed.length === 0 &&
        allMyUniqueLocalCodes.length === 0
      ) {
        setIsLoading(false);
        setDisplayableStories([]);
        onSetHasContent?.(false);
        return;
      }

      const relevantStories = allStoriesFromFeed.filter(
        (story: ExtendedStoryMetadata) => {
          // The backend already filters for active user participation,
          // but we still need to check local codes for unauthenticated users
          if (user) {
            // For authenticated users, backend handles filtering
            // But we need to check if this story has the user's participation in the right status
            const userPlayer = story.players.find((p) => p.userId === user.id);

            // Show only stories where user has active participation (default behavior)
            return userPlayer && userPlayer.status === "active";
          }

          // For unauthenticated users, check local codes (only show active)
          const localCodePlayers = story.players.filter(
            (p: StoryPlayerEntry) =>
              p.code &&
              allMyUniqueLocalCodes.includes(p.code) &&
              p.status === "active"
          );
          return localCodePlayers.length > 0;
        }
      );

      relevantStories.sort(
        (a: ExtendedStoryMetadata, b: ExtendedStoryMetadata) =>
          b.updatedAt - a.updatedAt
      );

      setDisplayableStories(relevantStories);
      onSetHasContent?.(relevantStories.length > 0);
      setError(null);
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : "Failed to process resumable stories";
      Logger.App.error(
        "ResumableStories: Error processing stories from feed:",
        e
      );
      setError(errorMessage);
      setDisplayableStories([]);
      onSetHasContent?.(false);
    } finally {
      setIsLoading(false);
    }
  }, [
    activeStoryFeed,
    user,
    isAuthenticated,
    onSetHasContent,
    isSessionLoading,
    showArchivedOnly,
    fetchArchivedStories,
  ]);

  // Process archived stories when archivedStoryFeed changes
  useEffect(() => {
    if (!showArchivedOnly) {
      return;
    }

    try {
      const allArchivedStories: ExtendedStoryMetadata[] =
        Object.values(archivedStoryFeed);

      const relevantStories = allArchivedStories.filter(
        (story: ExtendedStoryMetadata) => {
          if (!user) return false;

          const userPlayer = story.players.find((p) => p.userId === user.id);
          return userPlayer && userPlayer.status === "archived";
        }
      );

      relevantStories.sort(
        (a: ExtendedStoryMetadata, b: ExtendedStoryMetadata) =>
          b.updatedAt - a.updatedAt
      );

      setDisplayableStories(relevantStories);
      onSetHasContent?.(relevantStories.length > 0);
      setError(null);
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : "Failed to process archived stories";
      Logger.App.error(
        "ResumableStories: Error processing archived stories:",
        e
      );
      setError(errorMessage);
      setDisplayableStories([]);
      onSetHasContent?.(false);
    } finally {
      setIsLoading(false);
    }
  }, [archivedStoryFeed, user, onSetHasContent, showArchivedOnly]);

  const handlePlay = (storyId: string, code?: string) => {
    Logger.App.log(`ResumableStories: Play story ${storyId} with code ${code}`);
    if (code) {
      navigate(`/game/${code}`);
    } else {
      const storyToPlay = activeStoryFeed[storyId];
      if (storyToPlay) {
        const currentUserPlayerEntry = storyToPlay.players.find(
          (p: StoryPlayerEntry) => p.isCurrentUser && p.code
        );
        if (currentUserPlayerEntry && currentUserPlayerEntry.code) {
          navigate(`/game/${currentUserPlayerEntry.code}`);
          return;
        }
        if (storyToPlay.players.length === 1 && storyToPlay.players[0].code) {
          navigate(`/game/${storyToPlay.players[0].code}`);
          return;
        }
      }
      Logger.App.warn(
        `ResumableStories: Play action for story ${storyId}, but no usable code found directly or via current user.`
      );
    }
  };

  const handleArchive = async (storyId: string) => {
    if (!user) {
      Logger.App.warn(
        "ResumableStories: Archive attempted without authentication"
      );
      setError("You must be logged in to archive stories.");
      return;
    }

    try {
      const story = activeStoryFeed[storyId];
      if (!story) return;

      // Find the user's player slot
      const userPlayerEntry = story.players.find(
        (p: StoryPlayerEntry) => p.isCurrentUser
      );

      if (!userPlayerEntry) {
        Logger.App.error(
          `ResumableStories: No player slot found for user in story ${storyId}`
        );
        return;
      }

      // Get all codes for this story before archiving
      const storyCodes = story.players
        .filter((p) => p.code)
        .map((p) => p.code!)
        .filter((code) => code); // Remove any undefined values

      await storyApi.updateStoryStatus({
        storyId,
        playerSlot: userPlayerEntry.playerSlot,
        status: "archived",
      });

      Logger.App.log(`ResumableStories: Archived story ${storyId}`);

      // Remove story codes from local storage when archiving
      if (storyCodes.length > 0) {
        removeCodeSetFromStorage(storyCodes);
        Logger.App.log(
          `ResumableStories: Removed codes from local storage for archived story ${storyId}:`,
          storyCodes
        );
      }

      // Refresh the active story feed to update the UI
      await fetchStoryFeed();
    } catch (error) {
      Logger.App.error(
        `ResumableStories: Failed to archive story ${storyId}:`,
        error
      );
      setError("Failed to archive story. Please try again.");
    }
  };

  const handleResume = async (storyId: string) => {
    if (!user) {
      Logger.App.warn(
        "ResumableStories: Resume attempted without authentication"
      );
      setError("You must be logged in to resume stories.");
      return;
    }

    try {
      const story = archivedStoryFeed[storyId];
      if (!story) return;

      // Find the user's player slot
      const userPlayerEntry = story.players.find(
        (p: StoryPlayerEntry) => p.isCurrentUser
      );

      if (!userPlayerEntry) {
        Logger.App.error(
          `ResumableStories: No player slot found for user in story ${storyId}`
        );
        return;
      }

      await storyApi.updateStoryStatus({
        storyId,
        playerSlot: userPlayerEntry.playerSlot,
        status: "active",
      });

      Logger.App.log(`ResumableStories: Resumed story ${storyId}`);
      // Refresh the archived story feed to update the UI
      await fetchArchivedStories();
      // Also refresh the active story feed so it appears there too
      await fetchStoryFeed();
    } catch (error) {
      Logger.App.error(
        `ResumableStories: Failed to resume story ${storyId}:`,
        error
      );
      setError("Failed to resume story. Please try again.");
    }
  };

  const handleDelete = async (storyId: string) => {
    if (!user) {
      Logger.App.warn(
        "ResumableStories: Delete attempted without authentication"
      );
      setError("You must be logged in to delete stories.");
      return;
    }

    try {
      const story = showArchivedOnly
        ? archivedStoryFeed[storyId]
        : activeStoryFeed[storyId];
      if (!story) return;

      // Find the user's player slot
      const userPlayerEntry = story.players.find(
        (p: StoryPlayerEntry) => p.isCurrentUser
      );

      if (!userPlayerEntry) {
        Logger.App.error(
          `ResumableStories: No player slot found for user in story ${storyId}`
        );
        return;
      }

      // Get all codes for this story before deleting
      const storyCodes = story.players
        .filter((p) => p.code)
        .map((p) => p.code!)
        .filter((code) => code); // Remove any undefined values

      await storyApi.updateStoryStatus({
        storyId,
        playerSlot: userPlayerEntry.playerSlot,
        status: "deleted",
      });

      Logger.App.log(`ResumableStories: Deleted story ${storyId}`);

      // Remove story codes from local storage if they exist
      if (storyCodes.length > 0) {
        removeCodeSetFromStorage(storyCodes);
        Logger.App.log(
          `ResumableStories: Removed codes from local storage for story ${storyId}:`,
          storyCodes
        );
      }

      // Refresh the appropriate feed based on current view
      if (showArchivedOnly) {
        await fetchArchivedStories();
      } else {
        await fetchStoryFeed();
      }
    } catch (error) {
      Logger.App.error(
        `ResumableStories: Failed to delete story ${storyId}:`,
        error
      );
      setError("Failed to delete story. Please try again.");
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center p-4">
        <div className="animate-spin h-5 w-5 border-2 border-primary-500 rounded-full border-t-transparent"></div>
      </div>
    );
  }

  if (onSetHasContent && error) {
    return null;
  }
  if (onSetHasContent && !isLoading && displayableStories.length === 0) {
    return null;
  }

  if (error) {
    return <div className="text-red-500 p-4 text-sm">Error: {error}</div>;
  }

  if (displayableStories.length === 0) {
    return (
      <div className="text-gray-500 text-sm p-4">
        No resumable stories found.
      </div>
    );
  }

  return (
    <div
      className={
        "w-full space-y-4" +
        (!forceSingleColumn
          ? " md:grid md:grid-cols-2 md:gap-4 md:space-y-0"
          : "")
      }
    >
      {displayableStories.map((story: ExtendedStoryMetadata) => {
        return (
          <StoryCard
            key={story.id}
            story={story}
            onPlay={handlePlay}
            onArchive={showArchivedOnly ? undefined : handleArchive}
            onResume={showArchivedOnly ? handleResume : undefined}
            onDelete={handleDelete}
            showPlayButton={true}
            showArchivedContent={showArchivedOnly}
          />
        );
      })}
    </div>
  );
};
