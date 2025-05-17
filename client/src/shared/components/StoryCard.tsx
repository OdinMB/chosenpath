import { formatRelativeTime } from "../utils/timeUtils";
import { CoverCard } from "./CoverCard";
import { PrimaryButton, InfoIcon, ConfirmDialog, Icons, Tooltip } from "./ui";
import { UserStoryCodeAssociation, StoryMetadata } from "core/types/api";
import { PlayerCode } from "./PlayerCode";
import { useAuth } from "shared/useAuth";
import { useState } from "react";

type StoryCardProps = {
  story: StoryMetadata;
  players?: UserStoryCodeAssociation[];
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

  // Size-based class mapping
  const sizeClasses = {
    title: size === "large" ? "text-xl" : "text-lg",
    info: size === "large" ? "text-sm" : "text-xs",
  };

  // Get the user's player slot if available
  const userPlayer = players.find((p) => p.userId === user?.id);

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
      onPlay(story.id, userPlayer?.code);
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

  // Determine which codes to show - if user is creator, show all; otherwise only show user's code
  const isCreator = user?.id && story.creatorId === user.id;
  const codesToShow = isCreator
    ? players
    : players.filter((p) => p.userId === user?.id);

  // Function to get label for a player code
  const getPlayerCodeLabel = (player: UserStoryCodeAssociation) => {
    // User's own code
    if (player.userId === user?.id) {
      return "You";
    }
    // Other players' codes
    return `Player ${player.playerSlot.replace("player", "")}`;
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
          <h3 className={`${sizeClasses.title} text-primary-800`}>
            {story.title}
          </h3>
          {showPlayButton && onPlay && (
            <PrimaryButton
              onClick={handlePlay}
              className="ml-4 w-auto" // Desktop: auto width, margin left
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
          <PrimaryButton
            onClick={handlePlay}
            className="w-full mb-3 md:hidden" // Mobile: full width, margin bottom. Hidden on md+
          >
            Resume
          </PrimaryButton>
        )}

        {codesToShow.length > 0 && (
          <div className="mt-3 flex flex-col gap-2">
            {codesToShow.map((player) => (
              <div key={player.code} className="flex items-center">
                <PlayerCode
                  code={player.code}
                  size="sm"
                  label={getPlayerCodeLabel(player)}
                />
                {players.length >= 2 && player.isPending && (
                  <span className="ml-2 text-xs text-yellow-600 font-semibold">
                    Pending
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {children}

        <div className="flex-grow"></div>

        {onDelete && isCreator && (
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
