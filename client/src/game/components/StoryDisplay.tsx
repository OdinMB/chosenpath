import React from "react";
import { useSession } from "shared/useSession";
import { BeatHistory } from "./BeatHistory";
import { LoadingSpinner } from "components/ui";
import { BeatContent } from "./BeatContent";
import { NextBeatPlaceholder } from "./NextBeatPlaceholder";
import { useStoryBeatState } from "../hooks/useStoryBeatState";

interface StoryDisplayProps {
  onChoiceSelected: (index: number) => void;
}

export function StoryDisplay({ onChoiceSelected }: StoryDisplayProps) {
  const { storyState, isRequestPending } = useSession();
  const contentRef = React.useRef<HTMLDivElement>(null);

  // Use our custom hook for beat state management
  const {
    displayedBeatIndex,
    showNextBeatPlaceholder,
    localSelectedChoice,
    beatHistory,
    isViewingLatestBeat,
    navigateToBeat,
    handleChoiceSelected,
  } = useStoryBeatState({
    storyState,
    isRequestPending,
  });

  // Forward choice selections to the parent component
  const handleChoiceClick = (index: number) => {
    handleChoiceSelected(index);
    onChoiceSelected(index);
  };

  // Scroll to top when displayed beat changes
  React.useEffect(() => {
    if (displayedBeatIndex !== null) {
      // Try multiple scroll approaches to ensure it works across browsers
      if (contentRef.current) {
        contentRef.current.scrollTop = 0;
      }

      // Also try scrolling the window as a fallback
      window.scrollTo(0, 0);

      // And try with a timeout as a last resort
      setTimeout(() => {
        if (contentRef.current) {
          contentRef.current.scrollTop = 0;
        }
        window.scrollTo(0, 0);
      }, 100);
    }
  }, [displayedBeatIndex]);

  // Get the current beat based on displayed index
  const currentBeat =
    displayedBeatIndex !== null && displayedBeatIndex < beatHistory.length
      ? beatHistory[displayedBeatIndex]
      : null;

  // Get the previous beat index for displaying previous choice
  const previousBeatIndex =
    displayedBeatIndex !== null && displayedBeatIndex > 0
      ? displayedBeatIndex - 1
      : null;

  // Determine if we're currently showing the placeholder
  const isShowingPlaceholder =
    showNextBeatPlaceholder && displayedBeatIndex === beatHistory.length;

  // Check if the latest beat has a confirmed choice
  const hasConfirmedChoice =
    beatHistory.length > 0 && beatHistory[beatHistory.length - 1].choice !== -1;

  // Calculate the total beats count
  // Should include a placeholder beat if the latest beat has a confirmed choice
  const totalBeatsCount = beatHistory.length + (hasConfirmedChoice ? 1 : 0);

  // Base case - no story state yet
  if (!storyState) {
    return null;
  }

  // Loading state for initial beat
  if (beatHistory.length === 0) {
    if (!storyState.characterSelectionCompleted) {
      return null;
    }

    return (
      <div className="story-display h-full min-h-[50vh] md:min-h-[70vh] flex items-center justify-center font-lora">
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
      <div className="sticky top-0 bg-white z-10">
        {beatHistory.length > 0 && (
          <BeatHistory
            currentBeatIndex={displayedBeatIndex || 0}
            totalBeats={totalBeatsCount}
            pendingBeat={hasConfirmedChoice}
            onBeatChange={navigateToBeat}
          />
        )}
      </div>

      <div ref={contentRef} className="flex-1 p-4 md:p-6 overflow-y-auto">
        <div className="space-y-4 md:space-y-6">
          {isShowingPlaceholder ? (
            <NextBeatPlaceholder
              storyState={storyState}
              previousBeat={beatHistory[beatHistory.length - 1]}
            />
          ) : (
            <BeatContent
              storyState={storyState}
              currentBeat={currentBeat}
              previousBeatIndex={previousBeatIndex}
              displayedBeatIndex={displayedBeatIndex}
              beatHistory={beatHistory}
              isViewingLatestBeat={isViewingLatestBeat}
              localSelectedChoice={localSelectedChoice}
              isRequestPending={isRequestPending}
              onChoiceSelected={handleChoiceClick}
            />
          )}
        </div>
      </div>
    </div>
  );
}
