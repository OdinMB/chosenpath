import { useUserStories } from "../hooks";
import { UserStoryCodeAssociation } from "core/types/api";
import { StoryCard } from "shared/components/StoryCard";

interface UserStoriesListProps {
  onCodeSelect?: (code: string) => void;
}

export function UserStoriesList({ onCodeSelect }: UserStoriesListProps) {
  const { storyCodes, stories, isLoadingCodes, isLoadingStories, error } =
    useUserStories();

  if (isLoadingCodes || isLoadingStories) {
    return (
      <div className="flex justify-center p-4">
        <div className="animate-spin h-5 w-5 border-2 border-primary-500 rounded-full border-t-transparent"></div>
      </div>
    );
  }

  if (error) {
    return <div className="text-red-500 p-4 text-sm">{error}</div>;
  }

  const handlePlay = (_storyId: string, code?: string) => {
    if (onCodeSelect && code) {
      onCodeSelect(code);
    }
  };

  // Group story codes by storyId to show all players for each story
  const storyCodesMap = new Map<string, UserStoryCodeAssociation[]>();
  storyCodes.forEach((code) => {
    if (!storyCodesMap.has(code.storyId)) {
      storyCodesMap.set(code.storyId, []);
    }
    storyCodesMap.get(code.storyId)?.push(code);
  });

  return (
    <div className="w-full">
      {stories.length === 0 ? (
        <div className="text-gray-500 text-sm p-4">
          You don't have any active stories yet.
        </div>
      ) : (
        <div className="space-y-4">
          {stories.map((story) => {
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
