import { useState } from "react";
import { useUserStories } from "../hooks";
import { UserStoryCodeAssociation } from "core/types/api";
import { PrimaryButton } from "shared/components/ui";
import { PlayerCode } from "shared/components";

interface UserStoriesListProps {
  onCodeSelect?: (code: string) => void;
}

export function UserStoriesList({ onCodeSelect }: UserStoriesListProps) {
  const { storyCodes, isLoadingCodes, error } = useUserStories();
  const [selectedTabIndex, setSelectedTabIndex] = useState(0);

  if (isLoadingCodes) {
    return (
      <div className="flex justify-center p-4">
        <div className="animate-spin h-5 w-5 border-2 border-primary-500 rounded-full border-t-transparent"></div>
      </div>
    );
  }

  if (error) {
    return <div className="text-red-500 p-4 text-sm">{error}</div>;
  }

  const handleCodeClick = (code: string) => {
    if (onCodeSelect) {
      onCodeSelect(code);
    }
  };

  return (
    <div className="w-full">
      <div className="flex border-b mb-4">
        <button
          className={`px-4 py-2 font-medium text-sm ${
            selectedTabIndex === 0
              ? "border-b-2 border-primary-500 text-primary-700"
              : "text-gray-500 hover:text-gray-700"
          }`}
          onClick={() => setSelectedTabIndex(0)}
        >
          Active Stories
        </button>
      </div>

      {storyCodes.length === 0 ? (
        <div className="text-gray-500 text-sm p-4">
          You don't have any active stories yet.
        </div>
      ) : (
        <div className="space-y-4">
          {storyCodes.map((storyCode) => (
            <StoryCodeItem
              key={`${storyCode.storyId}-${storyCode.playerSlot}`}
              storyCode={storyCode}
              onCodeClick={handleCodeClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface StoryCodeItemProps {
  storyCode: UserStoryCodeAssociation;
  onCodeClick: (code: string) => void;
}

function StoryCodeItem({ storyCode, onCodeClick }: StoryCodeItemProps) {
  const formatPlayerLabel = (slot: string) => {
    // Convert "player1" to "Player 1"
    const match = slot.match(/player(\d+)/i);
    if (match && match[1]) {
      return `Player ${match[1]}`;
    }
    return slot;
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  return (
    <div className="border rounded-lg p-3 bg-white shadow-sm">
      <div className="flex justify-between items-start">
        <div>
          <div className="font-medium text-primary-700">
            Story: {storyCode.storyId}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {formatPlayerLabel(storyCode.playerSlot)}
          </div>
          <div className="text-xs text-gray-500">
            Last played: {formatDate(storyCode.lastPlayedAt)}
          </div>

          <div className="mt-2">
            <PlayerCode code={storyCode.code} size="sm" />
          </div>
        </div>

        <div>
          <PrimaryButton size="sm" onClick={() => onCodeClick(storyCode.code)}>
            Play
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}
