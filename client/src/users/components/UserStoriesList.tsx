import {
  UserStoryCodeAssociation,
  StoryMetadata,
  ExtendedStoryMetadata,
} from "core/types/api";
import { StoryCard } from "shared/components/StoryCard";
import { Logger } from "shared/logger";
import { useMemo, useEffect, useState } from "react";
import { useAuth } from "shared/useAuth";
import { usersApi } from "../usersApi";

interface UserStoriesListProps {
  stories?: StoryMetadata[];
  storyCodes?: UserStoryCodeAssociation[];
  isLoading?: boolean;
  error?: string | null;
  onCodeSelect?: (code: string) => void;
}

export function UserStoriesList({
  stories: storiesProp,
  storyCodes: storyCodesProp,
  isLoading: isLoadingProp,
  error: errorProp,
  onCodeSelect,
}: UserStoriesListProps) {
  const { user, isAuthenticated } = useAuth();

  const [internalStories, setInternalStories] = useState<
    StoryMetadata[] | null
  >(null);
  const [internalStoryCodes, setInternalStoryCodes] = useState<
    UserStoryCodeAssociation[] | null
  >(null);
  const [internalIsLoading, setInternalIsLoading] = useState<boolean>(false);
  const [internalError, setInternalError] = useState<string | null>(null);

  const shouldUseInternalState =
    storiesProp === undefined && storyCodesProp === undefined;

  useEffect(() => {
    if (shouldUseInternalState && isAuthenticated) {
      const fetchUserStories = async () => {
        setInternalIsLoading(true);
        setInternalError(null);
        try {
          Logger.App.log("UserStoriesList: Fetching stories internally...");
          const fetchedExtendedStories: ExtendedStoryMetadata[] =
            await usersApi.getAllUserStories();

          const mappedStories: StoryMetadata[] = fetchedExtendedStories.map(
            (story) => ({
              id: story.id,
              title: story.title,
              templateId: story.templateId,
              createdAt: story.createdAt,
              updatedAt: story.updatedAt,
              maxTurns: story.maxTurns,
              generateImages: story.generateImages,
              creatorId: story.creatorId,
              currentBeat: story.currentBeat,
            })
          );

          const mappedCodes: UserStoryCodeAssociation[] =
            fetchedExtendedStories.flatMap((story) =>
              story.players.map((player) => ({
                userId: player.userId || user?.id || "",
                storyId: player.storyId,
                playerSlot: player.playerSlot,
                code: player.code,
                createdAt: story.createdAt,
                lastPlayedAt: player.lastPlayedAt,
                isPending: player.isPending,
              }))
            );

          setInternalStories(mappedStories);
          setInternalStoryCodes(mappedCodes);
          Logger.App.log(
            `UserStoriesList: Fetched ${mappedStories.length} stories and ${mappedCodes.length} codes internally.`
          );
        } catch (err) {
          const errorMessage =
            err instanceof Error ? err.message : "Failed to load stories";
          Logger.App.error(
            "UserStoriesList: Error fetching stories internally:",
            err
          );
          setInternalError(errorMessage);
        } finally {
          setInternalIsLoading(false);
        }
      };
      fetchUserStories();
    } else if (shouldUseInternalState && !isAuthenticated) {
      setInternalStories(null);
      setInternalStoryCodes(null);
      setInternalError(null);
      setInternalIsLoading(false);
    }
  }, [shouldUseInternalState, isAuthenticated, user?.id]);

  const stories = shouldUseInternalState ? internalStories : storiesProp;
  const storyCodes = shouldUseInternalState
    ? internalStoryCodes
    : storyCodesProp;
  const isLoading = shouldUseInternalState ? internalIsLoading : isLoadingProp;
  const error = shouldUseInternalState ? internalError : errorProp;

  useMemo(() => {
    Logger.App.log(
      "UserStoriesList - effective storyCodes:",
      storyCodes?.length ?? 0
    );
    Logger.App.log(
      "UserStoriesList - effective stories:",
      stories?.length ?? 0
    );
  }, [storyCodes, stories]);

  const handlePlay = (_storyId: string, code?: string) => {
    if (onCodeSelect && code) {
      onCodeSelect(code);
    }
  };

  const storyCodesMap = useMemo(() => {
    const map = new Map<string, UserStoryCodeAssociation[]>();
    if (storyCodes) {
      storyCodes.forEach((code) => {
        if (!map.has(code.storyId)) {
          map.set(code.storyId, []);
        }
        map.get(code.storyId)?.push(code);
      });
    }
    return map;
  }, [storyCodes]);

  const displayStories = useMemo(() => {
    if (!stories) return [];

    const result =
      stories.length > 0
        ? stories
        : Array.from(storyCodesMap.entries()).map(([storyId, codes]) => {
            if (codes.length === 0) {
              Logger.App.warn(
                `UserStoriesList: No codes found for storyId ${storyId} in fallback logic.`
              );
              return {
                id: storyId,
                title: `Story ${storyId.substring(0, 8)}...`,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                maxTurns: 0,
                currentBeat: 0,
                generateImages: false,
                creatorId: "",
              } as StoryMetadata;
            }
            const firstCode = codes[0];
            return {
              id: storyId,
              title: `Story ${storyId.substring(0, 8)}...`,
              createdAt: firstCode.createdAt,
              updatedAt: firstCode.lastPlayedAt ?? firstCode.createdAt,
              maxTurns: 10,
              currentBeat: undefined,
              generateImages: true,
              creatorId: firstCode.userId,
            } as StoryMetadata;
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

  if (shouldUseInternalState && !isAuthenticated && !internalStories) {
    return (
      <div className="text-gray-500 text-sm p-4">
        Please log in to see your stories.
      </div>
    );
  }

  return (
    <div className="w-full">
      {(!stories || stories.length === 0) &&
      (!storyCodes || storyCodes.length === 0) ? (
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
