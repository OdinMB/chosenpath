import { useStory } from "../contexts/StoryContext";

interface StoryDisplayProps {
  onChoiceSelected: (index: number) => void;
}

export function StoryDisplay({ onChoiceSelected }: StoryDisplayProps) {
  const { storyState, isLoading } = useStory();

  if (!storyState) return null;

  const currentBeat = storyState.beatHistory[storyState.beatHistory.length - 1];
  console.log("Current beat:", currentBeat);
  console.log("Story state:", storyState);
  const hasChoice = currentBeat?.choice === -1;

  return (
    <div className="story-display space-y-6">
      <div className="story-progress text-sm text-gray-600">
        Turn {storyState.currentTurn} of {storyState.maxTurns}
      </div>

      {currentBeat && (
        <>
          <h2 className="text-2xl font-bold">{currentBeat.title}</h2>

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

          {hasChoice && (
            <div className="choices-container space-y-4">
              {currentBeat.options.map((option, index) => (
                <button
                  key={index}
                  onClick={() => onChoiceSelected(index)}
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

      {isLoading && (
        <div className="loading-indicator text-center py-4">
          Generating story...
        </div>
      )}
    </div>
  );
}
