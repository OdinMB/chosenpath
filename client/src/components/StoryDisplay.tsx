// import React from "react";
import React from "react";
import { useSession } from "../hooks/useSession";
import { BeatHistory } from "./BeatHistory";

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

  // Get the player data from the first (and only) player in the players object
  const playerSlotId = storyState?.players
    ? Object.keys(storyState.players)[0]
    : undefined;
  const playerState = playerSlotId
    ? storyState?.players[playerSlotId]
    : undefined;
  const beatHistory = playerState?.beatHistory || [];

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
    if (choiceMade || displayedBeatIndex !== beatHistory.length - 1) return;
    setLocalSelectedChoice(index);
    onChoiceSelected(index);
  };

  const choiceMade = localSelectedChoice !== undefined;
  const currentBeat =
    displayedBeatIndex !== null ? beatHistory[displayedBeatIndex] : null;
  const isViewingLatestBeat = displayedBeatIndex === beatHistory.length - 1;

  const renderOptions = () => {
    if (!currentBeat) return null;

    // For previous beats or when a choice is made, only show the selected choice
    if ((!isViewingLatestBeat && currentBeat.choice !== -1) || choiceMade) {
      const choiceIndex = choiceMade
        ? localSelectedChoice!
        : currentBeat.choice;
      return (
        <div className="space-y-4">
          <div className="mt-6 text-lg bg-indigo-50 p-4 rounded-lg border border-indigo-100">
            <span className="font-bold">Choice: </span>
            <span className="text-indigo-800">
              {currentBeat.options[choiceIndex]}
            </span>
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
              {option}
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
      <div className="story-display">
        <div className="loading-indicator text-center py-4">
          <svg
            className="animate-spin h-5 w-5 text-gray-600 mx-auto mb-2"
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
          First story beat is being generated...
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

                <div className="narrative-text whitespace-pre-wrap text-base md:text-lg">
                  {currentBeat.text}
                </div>
              </div>

              {isLoading && (
                <div className="loading-indicator text-center py-4">
                  <svg
                    className="animate-spin h-5 w-5 text-gray-600 mx-auto mb-2"
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
                  {choiceMade
                    ? "Next story beat is being generated..."
                    : "Generating story..."}
                </div>
              )}

              {renderOptions()}
            </>
          )}

          {!currentBeat && isLoading && (
            <div className="loading-indicator text-center py-4">
              <svg
                className="animate-spin h-5 w-5 text-gray-600 mx-auto mb-2"
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
              First story beat is being generated...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
