// import React from "react";
import React from "react";
import { useSession } from "../hooks/useSession";
import { BeatHistory } from "./BeatHistory";
import ReactMarkdown from "react-markdown";
import type { ComponentType } from "react";
import { LoadingSpinner } from "./LoadingSpinner";

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
  const contentRef = React.useRef<HTMLDivElement>(null);

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

      // Scroll to top when a new beat arrives
      if (contentRef.current) {
        contentRef.current.scrollTop = 0;
      }
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
          <div className="mt-6 max-w-2xl mx-auto">
            <div className="bg-white p-4 rounded-lg border-l-8 border border-secondary shadow-md text-lg">
              <div className="flex items-start gap-2">
                <span className="font-bold text-primary">Choice: </span>
                <span className="text-primary">
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
        <div className="mt-6 space-y-3 max-w-2xl mx-auto">
          {currentBeat.options.map((option, index) => (
            <button
              key={index}
              onClick={() => handleChoiceClick(index)}
              className={`
                w-full p-4 text-lg text-left rounded-lg transition-all duration-300
                bg-white text-primary cursor-pointer font-lora
                border-l-8 border border-accent shadow-md
                hover:border-l-8 hover:border-secondary hover:shadow-lg
                hover:translate-x-1
                focus:outline-none focus:ring-2 focus:ring-accent focus:ring-opacity-50
              `}
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

  // Don't show the loading spinner if character selection is not completed
  if (playerState.beatHistory.length === 0) {
    if (!storyState.characterSelectionCompleted) {
      return null;
    }

    return (
      <div className="story-display h-full flex items-center justify-center font-lora">
        <div className="text-center">
          <LoadingSpinner
            size="large"
            message="First story beat is being generated..."
            messageSize="large"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="story-display relative flex flex-col h-full font-lora">
      <div className="sticky top-0 bg-white z-10 border-b border-primary-100">
        {beatHistory.length > 0 && (
          <BeatHistory
            currentBeatIndex={displayedBeatIndex || 0}
            totalBeats={beatHistory.length}
            onBeatChange={setDisplayedBeatIndex}
          />
        )}
      </div>

      <div ref={contentRef} className="flex-1 p-4 md:p-6 overflow-y-auto">
        <div className="space-y-4 md:space-y-6">
          {currentBeat && (
            <>
              {displayedBeatIndex === 0 && (
                <h1 className="text-2xl md:text-3xl font-bold text-center mb-4 text-primary">
                  {storyState.title}
                </h1>
              )}
              <h2 className="text-xl md:text-2xl font-bold text-center text-primary">
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
                        className="w-full h-full object-cover rounded-lg shadow-md border-l-4 border border-accent"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center border-l-4 border border-accent rounded-lg shadow-md bg-white">
                        <LoadingSpinner
                          size="small"
                          message="Generating image..."
                        />
                      </div>
                    )}
                  </div>
                )}

                <div className="narrative-text text-base md:text-lg [&>p]:mb-4 text-primary">
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
              {currentBeat && storyState?.pendingPlayers.length == 0 && (
                <div className="flex items-center justify-center gap-2 mt-6 p-4 bg-white rounded-lg border border-primary-100 shadow-md max-w-2xl mx-auto">
                  <LoadingSpinner
                    size="small"
                    message="Generating next story beat..."
                  />
                </div>
              )}
            </>
          )}

          {!currentBeat &&
            isLoading &&
            storyState.characterSelectionCompleted && (
              <div className="h-full flex items-center justify-center py-8">
                <div className="text-center p-6 bg-white rounded-lg border border-primary-100 shadow-md">
                  <LoadingSpinner
                    size="large"
                    message="First story beat is being generated..."
                  />
                </div>
              </div>
            )}
        </div>
      </div>
    </div>
  );
}
