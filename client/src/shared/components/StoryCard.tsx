import { formatRelativeTime } from "../utils/timeUtils";
import { CoverCard } from "./CoverCard";
import { PrimaryButton, InfoIcon, ConfirmDialog, Icons, Tooltip } from "./ui";
import { ExtendedStoryMetadata, StoryPlayerEntry } from "core/types/api";
import { PlayerCode } from "./PlayerCode";
import { useAuth } from "client/shared/auth/useAuth";
import { useState } from "react";
import { getDifficultyDescription } from "core/utils/difficultyUtils.ts";

type StoryCardProps = {
  story: ExtendedStoryMetadata;
  onPlay?: (storyId: string, code?: string) => void;
  onDelete?: (storyId: string) => void;
  showPlayButton?: boolean;
  size?: "default" | "large";
  className?: string;
  children?: React.ReactNode;
};

export const StoryCard = ({
  story,
  onPlay,
  onDelete,
  showPlayButton = true,
  size = "default",
  className = "",
  children,
}: StoryCardProps) => {
  const { user } = useAuth();
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);

  const players = story.players;

  const sortedPlayers = [...players].sort(
    (a: StoryPlayerEntry, b: StoryPlayerEntry) => {
      if (a.isCurrentUser && !b.isCurrentUser) {
        return -1;
      }
      if (!a.isCurrentUser && b.isCurrentUser) {
        return 1;
      }
      return 0;
    }
  );

  const sizeClasses = {
    title: size === "large" ? "text-xl" : "text-lg",
    info: size === "large" ? "text-sm" : "text-xs",
  };

  const userPlayer = players.find((p: StoryPlayerEntry) => p.isCurrentUser);

  const lastPlayedTime = userPlayer?.lastPlayedAt
    ? formatRelativeTime(userPlayer.lastPlayedAt)
    : "Never played";
  const createdTime = formatRelativeTime(story.createdAt);

  const infoTooltip = (
    <div className="space-y-1 p-1">
      <p>Created: {createdTime}</p>
      <p>Last played: {lastPlayedTime}</p>
    </div>
  );

  const handlePlay = () => {
    if (onPlay) {
      const playCode =
        userPlayer?.code ||
        (players.filter((p: StoryPlayerEntry) => p.code).length === 1
          ? players.find((p: StoryPlayerEntry) => p.code)?.code
          : undefined);
      onPlay(story.id, playCode);
    }
  };

  const handleDelete = () => {
    setIsConfirmDialogOpen(true);
  };

  const confirmDelete = () => {
    if (onDelete) {
      onDelete(story.id);
    }
    setIsConfirmDialogOpen(false);
  };

  const shouldShowImage = story.generateImages === true || story.templateId;
  const imageSource = story.templateId ? "template" : "story";
  const imageSourceId = story.templateId || story.id;

  const getPlayerCodeLabel = (player: StoryPlayerEntry) => {
    if (player.isCurrentUser) {
      return "You";
    }
    if (player.username) {
      return player.username;
    }
    const playerNumber = player.playerSlot.replace("player", "");
    return `Player ${playerNumber.trim()}`;
  };

  return (
    <>
      <ConfirmDialog
        isOpen={isConfirmDialogOpen}
        onClose={() => setIsConfirmDialogOpen(false)}
        onConfirm={confirmDelete}
        title="Delete Story"
        message="Are you sure you want to delete this story? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
      />
      <CoverCard
        sourceId={shouldShowImage ? imageSourceId : undefined}
        source={imageSource}
        title={story.title}
        size={size}
        onClick={showPlayButton && onPlay ? undefined : handlePlay}
        className={`${className} relative`}
      >
        <div className="hidden md:flex md:justify-between md:items-start mb-2">
          <h3 className={`${sizeClasses.title} text-primary-800 pr-2`}>
            {story.title}
          </h3>
          {showPlayButton && onPlay && (
            <PrimaryButton
              onClick={handlePlay}
              className="ml-4 w-auto flex-shrink-0"
            >
              Resume
            </PrimaryButton>
          )}
        </div>

        <h3 className={`${sizeClasses.title} text-primary-800 mb-2 md:hidden`}>
          {story.title}
        </h3>

        <div className="flex flex-col gap-1 text-primary-500 mb-3">
          <div className="flex items-center flex-wrap">
            <span className={`${sizeClasses.info} font-semibold`}>
              {typeof story.currentBeat === "number"
                ? `${story.currentBeat} / `
                : ""}
              {story.maxTurns} turns
            </span>
            {story.difficultyLevel && (
              <span className="flex items-center ml-3">
                <span className={`${sizeClasses.info} font-semibold mr-2`}>
                  {story.difficultyLevel.title}
                </span>
                <InfoIcon
                  tooltipText={getDifficultyDescription(
                    story.difficultyLevel.modifier
                  )}
                  position="top"
                  className="mb-1"
                />
              </span>
            )}
            <InfoIcon
              tooltipText={infoTooltip}
              position="top"
              className="ml-4 mb-1"
              icon={Icons.Clock}
            />
          </div>
        </div>

        {showPlayButton && onPlay && (
          <PrimaryButton onClick={handlePlay} className="w-full mb-3 md:hidden">
            Resume
          </PrimaryButton>
        )}

        {players.length > 0 && (
          <div className="mt-3 flex flex-col gap-2">
            {sortedPlayers.map((player: StoryPlayerEntry) => {
              const isMultiplayerStory = players.length > 1;
              const nameLabel = getPlayerCodeLabel(player);
              const nameFontSizeClass =
                nameLabel.length >= 8 ? "text-xs sm:text-sm" : "text-sm";

              const isSomeoneElsePending =
                isMultiplayerStory &&
                players.some(
                  (p: StoryPlayerEntry) =>
                    p.isPending && p.playerSlot !== player.playerSlot
                );
              const showWaiting =
                isMultiplayerStory &&
                !player.isPending &&
                (player.isCurrentUser ? isSomeoneElsePending : true);

              return (
                <div
                  key={player.playerSlot}
                  className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-2 items-center"
                >
                  <span
                    className={`font-medium text-primary-600 ${nameFontSizeClass} truncate`}
                  >
                    {nameLabel}
                  </span>
                  <div className="text-xs text-left w-[70px]">
                    {isMultiplayerStory && player.isPending && (
                      <span className="text-yellow-600 font-semibold">
                        Pending
                      </span>
                    )}
                    {showWaiting && (
                      <span className="text-primary-500 font-semibold">
                        Waiting
                      </span>
                    )}
                  </div>
                  <div className="md:pl-2">
                    <PlayerCode
                      code={player.code}
                      size="sm"
                      showShareLink={!!player.code}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {children}
        <div className="flex-grow"></div>
        {onDelete && story.creatorId === user?.id && (
          <div className="absolute bottom-3 right-3">
            <Tooltip content="Delete story" position="left">
              <button
                onClick={handleDelete}
                className="text-red-600 hover:text-red-700 focus:outline-none flex items-center"
                aria-label="Delete story"
              >
                <Icons.Trash />
              </button>
            </Tooltip>
          </div>
        )}
      </CoverCard>
    </>
  );
};
