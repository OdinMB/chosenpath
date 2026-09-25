import React from "react";
import { useGameSession } from "game/useGameSession";
import { BeatHistory } from "./BeatHistory";
import { BeatContent } from "./BeatContent";
import { NextBeatPlaceholder } from "./NextBeatPlaceholder";
import { useStoryBeatState } from "../hooks/useStoryBeatState";
import { PlayerInterlude } from "./PlayerInterlude";
import { LoadingSpinner } from "components/ui";
import { AiNotice } from "shared/components/AiNotice";
import { useBeatAiNotice } from "../hooks/useBeatAiNotice";

interface StoryDisplayProps {
  onChoiceSelected: (index: number) => void;
}

export function StoryDisplay({ onChoiceSelected }: StoryDisplayProps) {
  const { storyState, isRequestPending } = useGameSession();
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

  // The AI notice above the beat on screen: once per session, and at new Threads
  const aiNotice = useBeatAiNotice(
    storyState?.category,
    beatHistory,
    displayedBeatIndex
  );

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

  // Loading state for initial beat via PlayerInterlude
  if (beatHistory.length === 0) {
    if (!storyState.characterSelectionCompleted) {
      return null;
    }
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[70vh]">
        {aiNotice && (
          <AiNotice variant={aiNotice} className="max-w-2xl mt-8 px-4" />
        )}
        <PlayerInterlude
          storyState={storyState}
          className="mt-8 mb-4 sm:mb-8"
        />
        <div className="mt-2">
          <LoadingSpinner
            size="medium"
            message="Setting up the story..."
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
          {aiNotice && (
            <AiNotice variant={aiNotice} className="max-w-2xl mx-auto" />
          )}
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
