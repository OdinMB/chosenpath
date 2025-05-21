import { useEffect, useState } from "react";
import { useAuth } from "shared/useAuth";
import { useSession } from "shared/useSession";
import { getAllUniqueCodesFromStorage } from "shared/utils/codeSetUtils";
import { ExtendedStoryMetadata, StoryPlayerEntry } from "core/types/api";
import { StoryCard } from "./StoryCard";
import { Logger } from "shared/logger";
import { useNavigate } from "react-router-dom";

interface ResumableStoriesProps {
  onSetHasContent?: (hasContent: boolean) => void;
  forceSingleColumn?: boolean;
}

export const ResumableStories: React.FC<ResumableStoriesProps> = ({
  onSetHasContent,
  forceSingleColumn,
}) => {
  const { user, isAuthenticated } = useAuth();
  const { storyFeed, isLoading: isSessionLoading } = useSession();
  const navigate = useNavigate();

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [displayableStories, setDisplayableStories] = useState<
    ExtendedStoryMetadata[]
  >([]);

  useEffect(() => {
    if (isSessionLoading) {
      setIsLoading(true);
      return;
    }

    try {
      const allStoriesFromFeed: ExtendedStoryMetadata[] =
        Object.values(storyFeed);

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
          if (user && story.creatorId === user.id) return true;
          if (
            user &&
            story.players.some((p: StoryPlayerEntry) => p.userId === user.id)
          )
            return true;
          if (
            story.players.some(
              (p: StoryPlayerEntry) =>
                p.code && allMyUniqueLocalCodes.includes(p.code)
            )
          )
            return true;
          return false;
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
  }, [storyFeed, user, isAuthenticated, onSetHasContent, isSessionLoading]);

  const handlePlay = (storyId: string, code?: string) => {
    Logger.App.log(`ResumableStories: Play story ${storyId} with code ${code}`);
    if (code) {
      navigate(`/game/${code}`);
    } else {
      const storyToPlay = storyFeed[storyId];
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
            showPlayButton={true}
          />
        );
      })}
    </div>
  );
};
