import { formatRelativeTime } from "../utils/timeUtils";
import { CoverCard } from "./CoverCard";
import { PrimaryButton } from "./ui";
import { UserStoryCodeAssociation, StoryMetadata } from "core/types/api";

type StoryCardProps = {
  story: StoryMetadata;
  players?: UserStoryCodeAssociation[];
  onPlay?: (storyId: string, code?: string) => void;
  showPlayButton?: boolean;
  size?: "default" | "large";
  className?: string;
  children?: React.ReactNode;
};

export const StoryCard = ({
  story,
  players = [],
  onPlay,
  showPlayButton = true,
  size = "default",
  className = "",
  children,
}: StoryCardProps) => {
  // Size-based class mapping
  const sizeClasses = {
    title: size === "large" ? "text-xl" : "text-lg",
    info: size === "large" ? "text-sm" : "text-xs",
  };

  // Get the user's player slot if available
  const userPlayer = players.length > 0 ? players[0] : undefined;

  // Format the last played time
  const lastPlayedTime = userPlayer?.lastPlayedAt
    ? formatRelativeTime(userPlayer.lastPlayedAt)
    : undefined;

  // Format created time
  const createdTime = formatRelativeTime(story.createdAt);

  const handlePlay = () => {
    if (onPlay) {
      onPlay(story.id, userPlayer?.code);
    }
  };

  return (
    <CoverCard
      sourceId={story.id}
      source="story"
      title={story.title}
      size={size}
      onClick={handlePlay}
      className={className}
    >
      <div className="flex justify-between items-center mb-2">
        <h3 className={`${sizeClasses.title} text-primary-800`}>
          {story.title}
        </h3>
        {showPlayButton && onPlay && (
          <PrimaryButton onClick={handlePlay} className="ml-4">
            Play
          </PrimaryButton>
        )}
      </div>

      {/* Info */}
      <div className="flex flex-col gap-1 text-primary-500 mb-3">
        <div className="flex items-center gap-4">
          <span className={`${sizeClasses.info} font-semibold`}>
            {story.maxTurns} turns
          </span>
          {story.templateId && (
            <span className={`${sizeClasses.info}`}>Based on template</span>
          )}
        </div>
      </div>

      {/* Status */}
      <div className="flex flex-col gap-2 text-gray-700">
        {lastPlayedTime && (
          <p className={`${sizeClasses.info}`}>Last played: {lastPlayedTime}</p>
        )}
        <p className={`${sizeClasses.info}`}>Created: {createdTime}</p>
        {userPlayer && (
          <p className={`${sizeClasses.info}`}>
            You are Player {userPlayer.playerSlot.replace("player", "")}
          </p>
        )}
      </div>

      {/* Optional children */}
      {children}

      {/* Flex spacer */}
      <div className="flex-grow"></div>

      {/* Player count */}
      {players.length > 0 && (
        <div className="mt-auto pt-2">
          <span className={`${sizeClasses.info} text-primary-700`}>
            {players.length} active player{players.length !== 1 ? "s" : ""}
          </span>
        </div>
      )}
    </CoverCard>
  );
};
