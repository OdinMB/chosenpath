import React from "react";
import { useSession } from "../hooks/useSession";
import { BeatHistory } from "./BeatHistory";
import ReactMarkdown from "react-markdown";
import type { ComponentType } from "react";
import { LoadingSpinner } from "./ui/LoadingSpinner";
import { PreviousChoiceVisualizer } from "./PreviousChoiceVisualizer";
import { BeatFeedback } from "./feedback/BeatFeedback";
import { SkeletonBeat } from "./ui/SkeletonBeat";
import type {
  ChallengeOption,
  ResolutionDetails,
} from "../../../shared/types/beat";
import {
  POINTS_FOR_FAVORABLE_RESOLUTION,
  POINTS_FOR_MIXED_RESOLUTION,
  POINTS_FOR_UNFAVORABLE_RESOLUTION,
} from "../../../shared/config";

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
  const [showNextBeatPlaceholder, setShowNextBeatPlaceholder] =
    React.useState(false);
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

  // Helper function to get stat name by ID
  const getStatNameById = (statId: string): string => {
    if (!storyState) return statId;

    // Check player stats
    for (const stat of storyState.playerStats) {
      if (stat.id === statId) {
        return stat.name;
      }
    }

    // Check shared stats
    if (storyState.sharedStats) {
      for (const stat of storyState.sharedStats) {
        if (stat.id === statId) {
          return stat.name;
        }
      }
    }

    // If we don't find the stat, return a formatted version of the ID
    return statId
      .split("_")
      .slice(1)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  };

  // Helper function to enhance ResolutionDetails with pointModifiers
  const enhanceResolutionDetails = (
    details: ResolutionDetails,
    option: ChallengeOption,
    beatIndex: number
  ): ResolutionDetails => {
    // If pointModifiers already exist, return as is
    if (details.readablePointModifiers) return details;

    const modifiers: Array<[string, number]> = [];

    // Add base points from the option with appropriate label based on resourceType
    let basePointLabel = "Choice";
    if (option.resourceType === "sacrifice") {
      basePointLabel = "Sacrifice";
    } else if (option.resourceType === "reward") {
      basePointLabel = "Reward";
    }
    modifiers.push([basePointLabel, option.basePoints]);

    // Add stat modifiers with readable names
    if (option.modifiersToSuccessRate) {
      option.modifiersToSuccessRate.forEach((mod) => {
        // Get the stat name using our helper function
        const statName = getStatNameById(mod.statId);

        if (mod.effect !== 0) {
          modifiers.push([`${statName}`, mod.effect]);
        }
      });
    }

    // Add resolution effect from previous beat (if there was one)
    // Beats create momentum - favorable outcomes make it easier to succeed in following beats
    if (beatIndex > 1) {
      const previousBeat = beatHistory[beatIndex - 2];

      // Only add momentum if the previous beat had a resolution
      if (previousBeat && previousBeat.resolution) {
        let resolutionEffect = 0;

        switch (previousBeat.resolution) {
          case "favorable":
            resolutionEffect = POINTS_FOR_FAVORABLE_RESOLUTION;
            break;
          case "mixed":
            resolutionEffect = POINTS_FOR_MIXED_RESOLUTION;
            break;
          case "unfavorable":
            resolutionEffect = POINTS_FOR_UNFAVORABLE_RESOLUTION;
            break;
        }

        if (resolutionEffect !== 0) {
          modifiers.push([`Previous beat`, resolutionEffect]);
        }
      }
    }

    // Return enhanced details with modifiers
    return {
      ...details,
      readablePointModifiers: modifiers,
    };
  };

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
      // If we were showing a placeholder, keep displaying the latest beat
      if (showNextBeatPlaceholder) {
        setDisplayedBeatIndex(currentBeatCount - 1);
        setShowNextBeatPlaceholder(false);
      } else if (displayedBeatIndex === null) {
        // Initial load - display the latest beat
        setDisplayedBeatIndex(currentBeatCount - 1);
      }
    }
  }, [
    beatHistory.length,
    previousBeatCount,
    displayedBeatIndex,
    showNextBeatPlaceholder,
  ]);

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

    // Set the local choice and notify the parent
    setLocalSelectedChoice(index);
    onChoiceSelected(index);

    // Always move to the next beat view with placeholder when a choice is made
    // This will happen regardless of other pending players
    setShowNextBeatPlaceholder(true);
    setDisplayedBeatIndex(beatHistory.length);
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

  // Check if feedback should be shown for the current beat
  const shouldShowFeedback = () => {
    // Don't show feedback if there's no current beat
    if (!currentBeat) return false;

    // Don't show feedback for placeholder beats
    if (showNextBeatPlaceholder) return false;

    // Always show feedback for beats with content
    return true;
  };

  const renderOptions = () => {
    if (!currentBeat || storyState?.gameOver) {
      return null;
    }

    // Only show option buttons (not locked-in choices)
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

  // Helper function to render a previous beat's choice using the PreviousChoiceVisualizer
  const renderPreviousChoice = (
    prevBeatIndex: number,
    animateRoll: boolean = false
  ) => {
    if (prevBeatIndex < 0 || prevBeatIndex >= beatHistory.length) return null;

    const prevBeat = beatHistory[prevBeatIndex];
    if (!prevBeat || prevBeat.choice === -1) return null;

    const selectedOption = prevBeat.options[prevBeat.choice];

    // Check if there's resolution details for challenge beats
    let resolutionDetails;
    if (
      selectedOption.optionType === "challenge" &&
      prevBeat.resolution &&
      prevBeat.resolutionDetails
    ) {
      resolutionDetails = enhanceResolutionDetails(
        prevBeat.resolutionDetails,
        selectedOption as ChallengeOption,
        prevBeatIndex + 1 // Add 1 because beat index is 0-based but display is 1-based
      );
    }

    return (
      <PreviousChoiceVisualizer
        choice={selectedOption}
        resolution={prevBeat.resolution || undefined}
        resolutionDetails={resolutionDetails}
        animateRoll={animateRoll}
      />
    );
  };

  // Helper function to render a locked-in choice (only for current beat)
  const renderLockedInChoice = (
    beat: {
      options: Array<{ text: string }>;
      choice: number;
    },
    choiceIndex: number
  ) => {
    if (choiceIndex === -1 || !beat || !beat.options) return null;

    return (
      <div className="space-y-4">
        <div className="mt-6 max-w-2xl mx-auto">
          <div className="bg-white p-4 rounded-lg border-l-8 border border-secondary shadow-md text-lg">
            <div className="flex items-start">
              <span className="text-primary">
                {beat.options[choiceIndex].text}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Render a placeholder for the next beat
  const renderNextBeatPlaceholder = () => {
    if (!storyState || beatHistory.length === 0) return null;

    // Get the previous beat (the one that just had a choice made)
    const prevBeatIndex = beatHistory.length - 1;
    const prevBeat = beatHistory[prevBeatIndex];

    if (!prevBeat || prevBeat.choice === -1) return null;

    return (
      <>
        {/* Show the previous beat's choice with resolution if applicable */}
        {renderPreviousChoice(prevBeatIndex, true)}

        {/* Then show the skeleton for the next beat */}
        <div className="mt-6">
          <SkeletonBeat showImage={storyState.generateImages} />
        </div>
      </>
    );
  };

  // Render function for the current beat content or loading state
  const renderBeatContent = () => {
    // Check if we're showing a placeholder for the next beat
    if (showNextBeatPlaceholder && displayedBeatIndex === beatHistory.length) {
      return renderNextBeatPlaceholder();
    }

    // Get the current beat based on displayed index
    const currentBeat =
      displayedBeatIndex !== null && displayedBeatIndex < beatHistory.length
        ? beatHistory[displayedBeatIndex]
        : null;

    // Normal beat display
    if (currentBeat && storyState) {
      return (
        <>
          {/* Show previous beat's choice at the top if it exists */}
          {displayedBeatIndex !== null &&
            displayedBeatIndex > 0 &&
            renderPreviousChoice(displayedBeatIndex - 1)}

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

          {/* Add feedback for the beat */}
          <div className="mt-4 mb-4">
            {shouldShowFeedback() && (
              <BeatFeedback storyText={currentBeat.text} />
            )}
          </div>

          {/* For historical beats or the current beat with a choice, show the locked-in choice */}
          {(!isViewingLatestBeat || currentBeat.choice !== -1) &&
            renderLockedInChoice(
              currentBeat,
              currentBeat.choice !== -1 ? currentBeat.choice : selectedChoice!
            )}

          {/* For the latest beat with no choice, render options as buttons */}
          {isViewingLatestBeat &&
            currentBeat.choice === -1 &&
            !choiceMade &&
            renderOptions()}
        </>
      );
    }

    // Loading the first beat
    if (isLoading && storyState?.characterSelectionCompleted) {
      return (
        <div className="h-full flex items-center justify-center py-8">
          <div className="text-center p-6 bg-white rounded-lg border border-primary-100 shadow-md">
            <LoadingSpinner
              size="large"
              message="First story beat is being generated..."
            />
          </div>
        </div>
      );
    }

    return null;
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
            totalBeats={beatHistory.length}
            onBeatChange={setDisplayedBeatIndex}
          />
        )}
      </div>

      <div ref={contentRef} className="flex-1 p-4 md:p-6 overflow-y-auto">
        <div className="space-y-4 md:space-y-6">{renderBeatContent()}</div>
      </div>
    </div>
  );
}
