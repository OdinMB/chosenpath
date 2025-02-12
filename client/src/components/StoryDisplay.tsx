// import React from "react";
import { useStory } from "../hooks/useStory";
import type { Beat } from "../../../shared/types/beat";
import React from "react";

interface StoryDisplayProps {
  onChoiceSelected: (index: number) => void;
  selectedChoice?: number;
}

export function StoryDisplay({ onChoiceSelected }: StoryDisplayProps) {
  const { storyState, isLoading } = useStory();
  const [localSelectedChoice, setLocalSelectedChoice] = React.useState<number | undefined>(undefined);
  const [previousBeatCount, setPreviousBeatCount] = React.useState(0);

  // Reset the selected choice when a new beat arrives
  React.useEffect(() => {
    const currentBeatCount = storyState?.beatHistory?.length ?? 0;
    if (currentBeatCount !== previousBeatCount) {
      setLocalSelectedChoice(undefined);
      setPreviousBeatCount(currentBeatCount);
    }
  }, [storyState?.beatHistory, previousBeatCount]);

  const handleChoiceSelect = (index: number) => {
    setLocalSelectedChoice(index);
    onChoiceSelected(index);
  };

  const choiceMade = localSelectedChoice !== undefined;

  if (!storyState || storyState.beatHistory.length === 0) {
    return (
      <div className="story-display">
        <div className="loading-indicator text-center py-4">
          <svg className="animate-spin h-5 w-5 text-gray-600 mx-auto mb-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          First story beat is being generated...
        </div>
      </div>
    );
  }

  const currentBeat = storyState.beatHistory[
    storyState.beatHistory.length - 1
  ] as Beat;
  console.log("Current beat:", currentBeat);
  console.log("Story state:", storyState);

  return (
    <div className="story-display space-y-6">
      {storyState.beatHistory.length > 0 && (
        <div className="story-progress text-center text-sm text-gray-600 pb-0 -mb-5">
          Turn {storyState.currentTurn} of {storyState.maxTurns}
        </div>
      )}

      {currentBeat && (
        <>
          <h2 className="text-2xl font-bold text-center mt-0 pt-0">{currentBeat.title}</h2>

          {currentBeat.imageId && storyState.generateImages && (
            <div className="beat-image my-4">
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
                className="max-w-full rounded-lg shadow-lg"
              />
            </div>
          )}

          <div className="narrative-text whitespace-pre-wrap">
            {currentBeat.text}
          </div>

          {isLoading && (
            <div className="loading-indicator text-center py-4">
              <svg className="animate-spin h-5 w-5 text-gray-600 mx-auto mb-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              {choiceMade ? "Next story beat is being generated..." : "Generating story..."}
            </div>
          )}

          {currentBeat.options && (
            <>
              {choiceMade ? (
                <div>
                  <div className="choice-button w-full p-3 text-left border rounded">
                  Decision: {currentBeat.options[localSelectedChoice].text}
                  </div>
                </div>
              ) : (
                <div className="choices-container space-y-4">
                  {currentBeat.options.map((option, index) => (
                    <button
                      key={index}
                      onClick={() => handleChoiceSelect(index)}
                      disabled={isLoading}
                      className="choice-button w-full p-3 text-left border rounded hover:bg-gray-100 disabled:opacity-50"
                    >
                      {option.text}
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
          <svg className="animate-spin h-5 w-5 text-gray-600 mx-auto mb-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          First story beat is being generated...
        </div>
      )}
    </div>
  );
}
