import { useEffect, useState } from "react";
import { useAuth } from "shared/useAuth";
import { getResumableStories } from "shared/apiClient"; // Import standalone function
import { getSortedCodeSets } from "shared/utils/codeSetUtils";
import { ResumableStoryMetadata } from "core/types/api"; // Removed ResumableStoryPlayer as it's used inline
import { StoryCard } from "./StoryCard";
import { Logger } from "shared/logger";
import { useNavigate } from "react-router-dom";
import { UserStoryCodeAssociation } from "core/types/api"; // Import for explicit mapping

interface ResumableStoriesProps {
  onCodeSelect?: (code: string) => void;
}

export const ResumableStories: React.FC<ResumableStoriesProps> = ({
  onCodeSelect,
}) => {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [stories, setStories] = useState<ResumableStoryMetadata[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStories = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const localCodeSets = getSortedCodeSets();
        const storyCodes = localCodeSets.flatMap((cs) =>
          Object.values(cs.codes)
        );

        Logger.App.log(
          "ResumableStories: Fetching stories with userId:",
          user?.id,
          "and codes:",
          storyCodes.length
        );

        const fetchedData = await getResumableStories({
          userId: user?.id,
          storyCodes: storyCodes.length > 0 ? storyCodes : undefined,
        });

        setStories(fetchedData);
        Logger.App.log(
          "ResumableStories: Fetched stories count:",
          fetchedData.length
        );
      } catch (err) {
        const errorMessage =
          err instanceof Error
            ? err.message
            : "Failed to load resumable stories";
        Logger.App.error("ResumableStories: Error fetching stories:", err);
        setError(errorMessage);
      } finally {
        setIsLoading(false);
      }
    };
    fetchStories();
  }, [user, isAuthenticated]);

  const handlePlay = (storyId: string, code?: string) => {
    Logger.App.log(`ResumableStories: Play story ${storyId} with code ${code}`);
    if (onCodeSelect && code) {
      onCodeSelect(code);
    } else if (code) {
      const tabId =
        sessionStorage.getItem("tabId") ||
        Math.random().toString(36).substring(2, 15);
      localStorage.setItem(`playerCode_${tabId}`, code);
      navigate(`/game/${code}`);
    } else {
      Logger.App.warn(
        "ResumableStories: Play action, but no usable code found."
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

  if (error) {
    return <div className="text-red-500 p-4 text-sm">Error: {error}</div>;
  }

  if (stories.length === 0) {
    return (
      <div className="text-gray-500 text-sm p-4">
        No resumable stories found.
      </div>
    );
  }

  return (
    <div className="w-full space-y-4">
      {stories.map((story) => {
        const storyCardPlayers: UserStoryCodeAssociation[] = story.players.map(
          (p) => ({
            storyId: p.storyId,
            playerSlot: p.playerSlot,
            code: p.code || "", // Ensure code is a string
            userId: p.userId || "", // Ensure userId is a string
            lastPlayedAt: p.lastPlayedAt,
            isPending: p.isPending,
            createdAt: p.lastPlayedAt || story.createdAt, // Fallback for createdAt
            // Note: `username` from `ResumableStoryPlayer` is not part of `UserStoryCodeAssociation`
            // StoryCard will need to be adapted to use this if it's passed separately or if its player type changes.
          })
        );

        return (
          <StoryCard
            key={story.id}
            story={story}
            players={storyCardPlayers}
            onPlay={handlePlay}
            showPlayButton={true}
            // Pass down the original ResumableStoryPlayer array if StoryCard can use it for enriched display (e.g. usernames)
            // For now, sticking to UserStoryCodeAssociation for the 'players' prop.
            // We might need a new prop like `resumablePlayers={story.players}` for StoryCard to access usernames.
          />
        );
      })}
    </div>
  );
};
