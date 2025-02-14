// import React from "react";
import React from "react";
import { useSession } from "../hooks/useSession";

interface StoryDisplayProps {
  onChoiceSelected: (index: number) => void;
}

export function StoryDisplay({ onChoiceSelected }: StoryDisplayProps) {
  const { storyState, isLoading } = useSession();
  const [localSelectedChoice, setLocalSelectedChoice] = React.useState<
    number | undefined
  >(undefined);
  const [previousBeatCount, setPreviousBeatCount] = React.useState(0);

  // Get the player data from the first (and only) player in the players object
  const playerSlotId = storyState?.players
    ? Object.keys(storyState.players)[0]
    : undefined;
  const playerState = playerSlotId
    ? storyState?.players[playerSlotId]
    : undefined;

  // Reset the selected choice when a new beat arrives
  React.useEffect(() => {
    const currentBeatCount = playerState?.beatHistory?.length ?? 0;
    if (currentBeatCount !== previousBeatCount) {
      setLocalSelectedChoice(undefined);
      setPreviousBeatCount(currentBeatCount);
    }
  }, [playerState?.beatHistory, previousBeatCount]);

  const handleChoiceClick = (index: number) => {
    if (choiceMade) return; // Prevent multiple choices

    setLocalSelectedChoice(index);
    onChoiceSelected(index);
  };

  const choiceMade = localSelectedChoice !== undefined;

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

  const currentBeat =
    playerState.beatHistory[playerState.beatHistory.length - 1];

  return (
    <div className="story-display space-y-6">
      {playerState.beatHistory.length > 0 && (
        <div className="story-progress text-center text-sm text-gray-600 pb-0 -mb-5">
          Turn {playerState.beatHistory.length} of {storyState.maxTurns}
        </div>
      )}

      {currentBeat && (
        <>
          <h2 className="text-2xl font-bold text-center mt-0 pt-0">
            {currentBeat.title}
          </h2>

          <div className="narrative-container relative">
            {storyState.generateImages && (
              <div
                className={`float-right ml-6 mb-4 w-64 h-64 ${
                  !currentBeat.imageId ? "bg-gray-50" : ""
                }`}
              >
                {currentBeat.imageId ? (
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

            <div className="narrative-text whitespace-pre-wrap">
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

          {currentBeat.options && (
            <>
              {choiceMade ? (
                <div>
                  <div className="choice-button w-full p-3 text-left border rounded">
                    <strong>Choice:</strong>{" "}
                    {currentBeat.options[localSelectedChoice]}
                  </div>
                </div>
              ) : (
                <div className="choices-container space-y-4">
                  {currentBeat.options.map((option, index) => (
                    <button
                      key={index}
                      onClick={() => handleChoiceClick(index)}
                      disabled={isLoading}
                      className="choice-button w-full p-3 text-left 
                        border-2 rounded-lg
                        bg-white hover:bg-blue-50 active:bg-blue-100
                        border-blue-400 hover:border-blue-500
                        shadow-sm hover:shadow-md
                        transition-all duration-150
                        disabled:opacity-50 disabled:hover:bg-white 
                        disabled:border-gray-300 disabled:hover:border-gray-300
                        disabled:shadow-none disabled:hover:shadow-none"
                    >
                      {option}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
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
  );
}
