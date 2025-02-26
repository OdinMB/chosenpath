// import React from "react";
import React from "react";
import { useSession } from "../hooks/useSession";
import { BeatHistory } from "./BeatHistory";
import ReactMarkdown from "react-markdown";
import type { ComponentType } from "react";

interface StoryDisplayProps {
  onChoiceSelected: (index: number) => void;
}

export function StoryDisplay({ onChoiceSelected }: StoryDisplayProps) {
  const { storyState, isLoading } = useSession();
  const [localSelectedChoice, setLocalSelectedChoice] = React.useState<
    number | undefined
  >(undefined);
  const [previousBeatCount, setPreviousBeatCount] = React.useState(0);
  const [displayedBeatIndex, setDisplayedBeatIndex] = React.useState<
    number | null
  >(null);

  // Memoize player data calculations
  const playerSlotId = React.useMemo(
    () =>
      storyState?.players ? Object.keys(storyState.players)[0] : undefined,
    [storyState?.players]
  );

  const playerState = React.useMemo(
    () => (playerSlotId ? storyState?.players[playerSlotId] : undefined),
    [playerSlotId, storyState?.players]
  );

  const beatHistory = React.useMemo(
    () => playerState?.beatHistory || [],
    [playerState?.beatHistory]
  );

  // Initialize localSelectedChoice from server state when component mounts or state updates
  React.useEffect(() => {
    if (beatHistory.length > 0) {
      const currentBeat = beatHistory[beatHistory.length - 1];
      if (currentBeat.choice !== -1) {
        setLocalSelectedChoice(currentBeat.choice);
      }
    }
  }, [beatHistory]);

  // Reset the selected choice and displayed beat index when a new beat arrives
  React.useEffect(() => {
    const currentBeatCount = beatHistory.length;
    if (currentBeatCount !== previousBeatCount) {
      setLocalSelectedChoice(undefined);
      setPreviousBeatCount(currentBeatCount);
      setDisplayedBeatIndex(currentBeatCount - 1);
    }
  }, [beatHistory.length, previousBeatCount]);

  // Initialize displayedBeatIndex if null
  React.useEffect(() => {
    if (displayedBeatIndex === null && beatHistory.length > 0) {
      setDisplayedBeatIndex(beatHistory.length - 1);
    }
  }, [beatHistory.length, displayedBeatIndex]);

  const handleChoiceClick = (index: number) => {
    const currentBeat = beatHistory[beatHistory.length - 1];
    // Don't allow choice if already made (either locally or in server state)
    if (
      localSelectedChoice !== undefined ||
      currentBeat?.choice !== -1 ||
      displayedBeatIndex !== beatHistory.length - 1
    )
      return;

    setLocalSelectedChoice(index);
    onChoiceSelected(index);
  };

  // Check both local and server state for choice status
  const currentBeat =
    displayedBeatIndex !== null ? beatHistory[displayedBeatIndex] : null;
  // Use server state choice if available, otherwise use local state
  const selectedChoice =
    currentBeat && currentBeat.choice !== -1
      ? currentBeat.choice
      : localSelectedChoice;
  const choiceMade = selectedChoice !== undefined;
  const isViewingLatestBeat = displayedBeatIndex === beatHistory.length - 1;

  const renderOptions = () => {
    if (!currentBeat || storyState?.gameOver) return null;

    // For previous beats or when a choice is made, only show the selected choice
    if ((!isViewingLatestBeat && currentBeat.choice !== -1) || choiceMade) {
      const choiceIndex = choiceMade ? selectedChoice! : currentBeat.choice;
      return (
        <div className="space-y-4">
          <div className="mt-6">
            <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-100">
              <div className="flex items-center gap-2">
                <span className="font-bold">Choice: </span>
                <span className="text-indigo-800">
                  {currentBeat.options[choiceIndex].text}
                </span>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // For the current beat with no choice made, show all options as buttons
    return (
      <div className="space-y-4">
        <div className="mt-6 space-y-3">
          {currentBeat.options.map((option, index) => (
            <button
              key={index}
              onClick={() => handleChoiceClick(index)}
              className={`w-full p-4 text-lg text-left rounded-lg transition-colors 
                bg-gray-100 hover:bg-gray-200 cursor-pointer`}
            >
              {option.text}
            </button>
          ))}
        </div>
      </div>
    );
  };

  if (!storyState || !playerState) {
    return null;
  }

  if (playerState.beatHistory.length === 0) {
    return (
      <div className="story-display h-full flex items-center justify-center">
        <div className="text-center">
          <svg
            className="animate-spin h-8 w-8 text-gray-600 mx-auto mb-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            ></circle>
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
          </svg>
          <p className="text-xl font-medium text-gray-700">
            First story beat is being generated...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="story-display relative flex flex-col h-full">
      <div className="sticky top-0 bg-white z-10">
        {beatHistory.length > 0 && (
          <BeatHistory
            currentBeatIndex={displayedBeatIndex || 0}
            totalBeats={beatHistory.length}
            onBeatChange={setDisplayedBeatIndex}
          />
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="space-y-4 md:space-y-6">
          {currentBeat && (
            <>
              <h2 className="text-xl md:text-2xl font-bold text-center">
                {currentBeat.title}
              </h2>
              <div className="narrative-container relative">
                {storyState.generateImages && (
                  <div
                    className={`
                    w-full sm:w-64 sm:float-right sm:ml-6 mb-4 
                    aspect-square sm:h-64
                    max-w-[256px] mx-auto
                    ${!currentBeat.imageId ? "bg-gray-50" : ""}
                  `}
                  >
                    {currentBeat.imageId &&
                    storyState.images.find(
                      (img) =>
                        img.id === currentBeat.imageId && img.status === "ready"
                    ) ? (
                      <img
                        src={
                          storyState.images.find(
                            (img) => img.id === currentBeat.imageId
                          )?.url
                        }
                        alt={
                          storyState.images.find(
                            (img) => img.id === currentBeat.imageId
                          )?.description ?? ""
                        }
                        className="w-full h-full object-cover rounded-lg shadow-lg"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-lg">
                        <svg
                          className="animate-spin h-8 w-8 text-gray-400 mb-2"
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          ></circle>
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          ></path>
                        </svg>
                        <span className="text-sm text-gray-500">
                          Generating image...
                        </span>
                      </div>
                    )}
                  </div>
                )}

                <div className="narrative-text text-base md:text-lg [&>p]:mb-4">
                  {React.createElement(
                    ReactMarkdown as ComponentType<{
                      children: string;
                      breaks?: boolean;
                    }>,
                    { breaks: true, children: currentBeat.text }
                  )}
                </div>
              </div>
              {renderOptions()}
              {choiceMade &&
                currentBeat &&
                storyState?.pendingPlayers.length == 0 && (
                  <div className="flex items-center justify-center gap-2 mt-6 p-4 bg-gray-50 rounded-lg">
                    <svg
                      className="animate-spin h-5 w-5"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    <span className="text-base">
                      Generating next story beat...
                    </span>
                  </div>
                )}
            </>
          )}

          {!currentBeat && isLoading && (
            <div className="h-full flex items-center justify-center py-8">
              <div className="text-center">
                <svg
                  className="animate-spin h-8 w-8 text-gray-600 mx-auto mb-4"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                <p className="text-xl font-medium text-gray-700">
                  First story beat is being generated...
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
