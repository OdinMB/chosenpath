import { formatRelativeTime } from "../utils/timeUtils";
import { CoverCard } from "./CoverCard";
import { PrimaryButton, InfoIcon } from "./ui";
import { UserStoryCodeAssociation, StoryMetadata } from "core/types/api";
import { PlayerCode } from "./PlayerCode";
import { useAuth } from "shared/useAuth";

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
  const { user } = useAuth();

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
    <CoverCard
      sourceId={shouldShowImage ? imageSourceId : undefined}
      source={imageSource}
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
        <div className="flex items-center">
          <span className={`${sizeClasses.info} font-semibold`}>
            {story.maxTurns} turns
          </span>
          <InfoIcon
            tooltipText={infoTooltip}
            position="top"
            className="ml-4 mt-1"
          />
        </div>
      </div>

      {/* Story Codes */}
      {codesToShow.length > 0 && (
        <div className="mt-3 flex flex-col gap-2">
          {codesToShow.map((player) => (
            <PlayerCode
              key={player.code}
              code={player.code}
              size="sm"
              label={getPlayerCodeLabel(player)}
            />
          ))}
        </div>
      )}

      {/* Optional children */}
      {children}

      {/* Flex spacer */}
      <div className="flex-grow"></div>
    </CoverCard>
  );
};
