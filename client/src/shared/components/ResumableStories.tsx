import { useEffect, useState } from "react";
import { useAuth } from "shared/useAuth";
import { getResumableStories } from "shared/apiClient";
import { getSortedCodeSets } from "shared/utils/codeSetUtils";
import { StoredCodeSet } from "../SessionContext";
import {
  ResumableStoryMetadata,
  ResumableStoryPlayer,
  DisplayableStoryPlayer,
} from "core/types/api";
import { StoryCard } from "./StoryCard";
import { Logger } from "shared/logger";
import { useNavigate } from "react-router-dom";

interface ResumableStoriesProps {
  onSetHasContent?: (hasContent: boolean) => void;
}

export const ResumableStories: React.FC<ResumableStoriesProps> = ({
  onSetHasContent,
}) => {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [stories, setStories] = useState<ResumableStoryMetadata[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let didCancel = false;

    const determineAndFetch = async () => {
      const localSets: StoredCodeSet[] = getSortedCodeSets();
      const allFlattenedLocalCodes = localSets.flatMap((cs) =>
        cs.codes ? Object.values(cs.codes) : []
      );

      if (!user && allFlattenedLocalCodes.length === 0) {
        if (didCancel) return;
        Logger.App.log(
          "ResumableStories: Unauthenticated and no local codes. No content."
        );
        setIsLoading(false);
        setStories([]);
        setError(null);
        onSetHasContent?.(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const fetchedData = await getResumableStories({
          userId: user?.id,
          storyCodes:
            allFlattenedLocalCodes.length > 0
              ? allFlattenedLocalCodes
              : undefined,
        });

        if (didCancel) return;
        setStories(fetchedData);
        onSetHasContent?.(fetchedData.length > 0);
      } catch (err) {
        if (didCancel) return;
        const errorMessage =
          err instanceof Error
            ? err.message
            : "Failed to load resumable stories";
        Logger.App.error("ResumableStories: Error fetching stories:", err);
        setError(errorMessage);
        onSetHasContent?.(false);
      } finally {
        if (!didCancel) {
          setIsLoading(false);
        }
      }
    };

    determineAndFetch();

    return () => {
      didCancel = true;
    };
  }, [user, isAuthenticated, onSetHasContent]);

  const handlePlay = (storyId: string, code?: string) => {
    Logger.App.log(`ResumableStories: Play story ${storyId} with code ${code}`);
    if (code) {
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

  if (onSetHasContent && error) {
    return null;
  }
  if (onSetHasContent && !isLoading && stories.length === 0) {
    return null;
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

  const allLocalCodeSets: StoredCodeSet[] = getSortedCodeSets();

  return (
    <div className="w-full space-y-4">
      {stories.map((story) => {
        const allEffectivelyHeldCodes: string[] = allLocalCodeSets.flatMap(
          (cs) => Object.values(cs.codes)
        );

        let isPlayer1SlotOverriddenForThisStory = false;
        for (const localSet of allLocalCodeSets) {
          if (Object.values(localSet.codes).length > 1) {
            const localSetCodes = Object.values(localSet.codes);
            const storyPlayerCodes = story.players
              .map((player) => player.code)
              .filter(Boolean) as string[];
            if (
              localSetCodes.some((localCode) =>
                storyPlayerCodes.includes(localCode)
              )
            ) {
              isPlayer1SlotOverriddenForThisStory = true;
              break;
            }
          }
        }

        const displayPlayers: DisplayableStoryPlayer[] = story.players.map(
          (p: ResumableStoryPlayer) => {
            let isThisPlayerYou = false;
            if (isPlayer1SlotOverriddenForThisStory) {
              if (p.playerSlot === "player1") {
                isThisPlayerYou = true;
              } else {
                isThisPlayerYou = !!(user && user.id && user.id === p.userId);
              }
            } else {
              const isUserIdMatch = !!(user && user.id && user.id === p.userId);
              const isCodeHeldLocally = !!(
                p.code && allEffectivelyHeldCodes.includes(p.code)
              );
              isThisPlayerYou = isUserIdMatch || isCodeHeldLocally;
            }

            return {
              storyId: p.storyId,
              playerSlot: p.playerSlot,
              userId: p.userId,
              code: p.code,
              username: p.username,
              isPending: p.isPending,
              isCurrentUser: isThisPlayerYou,
              lastPlayedAt: p.lastPlayedAt,
              storyCreatedAt: story.createdAt,
            };
          }
        );

        return (
          <StoryCard
            key={story.id}
            story={story}
            players={displayPlayers}
            onPlay={handlePlay}
            showPlayButton={true}
          />
        );
      })}
    </div>
  );
};
