import { formatRelativeTime } from "../utils/timeUtils";
import { CoverCard } from "./CoverCard";
import { PrimaryButton, InfoIcon, ConfirmDialog, Icons, Tooltip } from "./ui";
import { ResumableStoryMetadata, DisplayableStoryPlayer } from "core/types/api";
import { PlayerCode } from "./PlayerCode";
import { useAuth } from "shared/useAuth";
import { useState } from "react";

type StoryCardProps = {
  story: ResumableStoryMetadata;
  players?: DisplayableStoryPlayer[];
  onPlay?: (storyId: string, code?: string) => void;
  onDelete?: (storyId: string) => void;
  showPlayButton?: boolean;
  size?: "default" | "large";
  className?: string;
  children?: React.ReactNode;
};

export const StoryCard = ({
  story,
  players = [],
  onPlay,
  onDelete,
  showPlayButton = true,
  size = "default",
  className = "",
  children,
}: StoryCardProps) => {
  const { user } = useAuth();
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);

  // Sort players: current user first, then by original order (or playerSlot for stability)
  const sortedPlayers = [...players].sort((a, b) => {
    if (a.isCurrentUser && !b.isCurrentUser) {
      return -1;
    }
    if (!a.isCurrentUser && b.isCurrentUser) {
      return 1;
    }
    // Optional: secondary sort by playerSlot if names can be ambiguous or for stability
    // return a.playerSlot.localeCompare(b.playerSlot);
    return 0; // Keep original relative order for non-current users
  });

  // Size-based class mapping
  const sizeClasses = {
    title: size === "large" ? "text-xl" : "text-lg",
    info: size === "large" ? "text-sm" : "text-xs",
  };

  // User's own player entry, now using isCurrentUser flag
  const userPlayer = players.find((p) => p.isCurrentUser);

  // Format timestamps for the tooltip
  const lastPlayedTime = userPlayer?.lastPlayedAt
    ? formatRelativeTime(userPlayer.lastPlayedAt)
    : "Never played";
  const createdTime = formatRelativeTime(story.createdAt);

  // Tooltip content with story info
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
        (players.filter((p) => p.code).length === 1
          ? players.find((p) => p.code)?.code
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

  // Determine if we should show the image and what source to use
  const shouldShowImage = story.generateImages === true || story.templateId;
  const imageSource = story.templateId ? "template" : "story";
  const imageSourceId = story.templateId || story.id;

  // Updated getPlayerCodeLabel to use isCurrentUser and username
  const getPlayerCodeLabel = (player: DisplayableStoryPlayer) => {
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
        {/* --- Desktop: Title and Resume Button on one line --- */}
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

        {/* --- Mobile: Title (standalone) --- */}
        <h3 className={`${sizeClasses.title} text-primary-800 mb-2 md:hidden`}>
          {story.title}
        </h3>

        {/* Info section (turns, icons) - Always below title configurations */}
        <div className="flex flex-col gap-1 text-primary-500 mb-3">
          <div className="flex items-center">
            <span className={`${sizeClasses.info} font-semibold`}>
              {typeof story.currentBeat === "number"
                ? `${story.currentBeat} / `
                : ""}
              {story.maxTurns} turns
            </span>
            <InfoIcon
              tooltipText={infoTooltip}
              position="top"
              className="ml-4 mt-1"
            />
          </div>
        </div>

        {/* --- Mobile: Resume Button (after info section) --- */}
        {showPlayButton && onPlay && (
          <PrimaryButton onClick={handlePlay} className="w-full mb-3 md:hidden">
            Resume
          </PrimaryButton>
        )}

        {/* Display player codes / usernames - iterate over ALL players */}
        {players.length > 0 && (
          <div className="mt-3 flex flex-col gap-2">
            {sortedPlayers.map((player) => {
              const isMultiplayerStory = story.players.length > 1;
              const nameLabel = getPlayerCodeLabel(player);
              const nameFontSizeClass =
                nameLabel.length >= 8 ? "text-xs sm:text-sm" : "text-sm";

              const isSomeoneElsePending =
                isMultiplayerStory &&
                story.players.some(
                  (p) => p.isPending && p.playerSlot !== player.playerSlot
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
                  {/* Col 1: Player Name */}
                  <span
                    className={`font-medium text-primary-600 ${nameFontSizeClass} truncate`}
                  >
                    {nameLabel}
                  </span>

                  {/* Col 2: Status Text - responsive width, text-left */}
                  <div className="text-xs text-left w-[70px]">
                    {" "}
                    {/* Consistent width for status column */}
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

                  {/* Col 3: Code + Icons - wrapped for non-mobile left padding */}
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
