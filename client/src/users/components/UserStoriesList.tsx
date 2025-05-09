import { useUserStories } from "../hooks";
import { UserStoryCodeAssociation } from "core/types/api";
import { StoryCard } from "shared/components/StoryCard";
import { Logger } from "shared/logger";
import { useMemo } from "react";

interface UserStoriesListProps {
  onCodeSelect?: (code: string) => void;
}

export function UserStoriesList({ onCodeSelect }: UserStoriesListProps) {
  const { storyCodes, stories, isLoading, error } = useUserStories();

  // Log only once when data changes
  useMemo(() => {
    Logger.App.log("UserStoriesList - storyCodes:", storyCodes.length);
    Logger.App.log("UserStoriesList - stories:", stories.length);
  }, [storyCodes.length, stories.length]);

  const handlePlay = (_storyId: string, code?: string) => {
    if (onCodeSelect && code) {
      onCodeSelect(code);
    }
  };

  // Group story codes by storyId - memoize to avoid recalculations
  const storyCodesMap = useMemo(() => {
    const map = new Map<string, UserStoryCodeAssociation[]>();
    storyCodes.forEach((code) => {
      if (!map.has(code.storyId)) {
        map.set(code.storyId, []);
      }
      map.get(code.storyId)?.push(code);
    });
    return map;
  }, [storyCodes]);

  // Create display stories - memoize to avoid recreating on each render
  const displayStories = useMemo(() => {
    // If there are no stories but we have story codes, create mock stories from the codes
    const result =
      stories.length > 0
        ? stories
        : Array.from(storyCodesMap.entries()).map(([storyId, codes]) => {
            const firstCode = codes[0];
            return {
              id: storyId,
              title: `Story ${storyId}`,
              createdAt: firstCode.createdAt,
              updatedAt: firstCode.lastPlayedAt,
              maxTurns: 10,
              generateImages: true,
              creatorId: firstCode.userId,
            };
          });

    Logger.App.log("UserStoriesList - displayStories count:", result.length);
    return result;
  }, [stories, storyCodesMap]);

  if (isLoading) {
    return (
      <div className="flex justify-center p-4">
        <div className="animate-spin h-5 w-5 border-2 border-primary-500 rounded-full border-t-transparent"></div>
      </div>
    );
  }

  if (error) {
    return <div className="text-red-500 p-4 text-sm">{error}</div>;
  }

  return (
    <div className="w-full">
      {displayStories.length === 0 ? (
        <div className="text-gray-500 text-sm p-4">
          You don't have any active stories yet.
        </div>
      ) : (
        <div className="space-y-4">
          {displayStories.map((story) => {
            const storyPlayers = storyCodesMap.get(story.id) || [];

            return (
              <StoryCard
                key={story.id}
                story={story}
                players={storyPlayers}
                onPlay={handlePlay}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
