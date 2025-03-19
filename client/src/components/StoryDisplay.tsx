import React from "react";
import { useSession } from "../hooks/useSession";
import { BeatHistory } from "./BeatHistory";
import ReactMarkdown from "react-markdown";
import type { ComponentType } from "react";
import { LoadingSpinner } from "./LoadingSpinner";
import { ChallengeResolutionVisualizer } from "./ChallengeResolutionVisualizer";
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
      setDisplayedBeatIndex(currentBeatCount - 1);
    }
  }, [beatHistory.length, previousBeatCount]);

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

  // Check if we're waiting for the next beat (choice made but next beat not loaded yet)
  const isWaitingForNextBeat =
    currentBeat &&
    currentBeat.choice !== -1 &&
    storyState?.pendingPlayers?.length === 0 &&
    isViewingLatestBeat;

  // The current beat may have resolution details we need to show
  const hasCurrentBeatResolutionDetails =
    currentBeat &&
    currentBeat.resolution &&
    currentBeat.resolutionDetails &&
    currentBeat.choice !== -1 &&
    currentBeat.options[currentBeat.choice].optionType === "challenge";

  // Check if current beat should show a resolution from the previous beat
  const shouldShowPreviousBeatResolution = () => {
    // When viewing beat n > 1, check if beat n-1 had a challenge resolution
    if (
      displayedBeatIndex &&
      displayedBeatIndex > 0 &&
      beatHistory.length > 1
    ) {
      const prevBeat = beatHistory[displayedBeatIndex - 1];
      return (
        prevBeat &&
        prevBeat.resolution &&
        prevBeat.resolutionDetails &&
        prevBeat.choice !== -1 &&
        prevBeat.options[prevBeat.choice].optionType === "challenge"
      );
    }
    return false;
  };

  const renderOptions = () => {
    if (!currentBeat || storyState?.gameOver || isWaitingForNextBeat)
      return null;

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

  // Render function for the current beat content or loading state
  const renderBeatContent = () => {
    // If we're waiting for the next beat and the current beat has challenge resolution details,
    // show them along with a loading spinner
    if (
      isWaitingForNextBeat &&
      hasCurrentBeatResolutionDetails &&
      currentBeat
    ) {
      // Get the chosen option and enhance resolution details with point modifiers
      const chosenOption = currentBeat.options[
        currentBeat.choice
      ] as ChallengeOption;
      const enhancedDetails = enhanceResolutionDetails(
        currentBeat.resolutionDetails!,
        chosenOption,
        displayedBeatIndex || 0
      );

      return (
        <>
          {/* Show resolution visualizer for the current beat */}
          <div className="my-4 max-w-2xl mx-auto">
            <ChallengeResolutionVisualizer
              resolutionDetails={enhancedDetails}
              resolution={currentBeat.resolution!}
              option={chosenOption}
              animateRoll={true}
            />
          </div>

          <div className="flex items-center justify-center gap-2 mt-6 p-4 bg-white rounded-lg border border-primary-100 shadow-md max-w-2xl mx-auto">
            <LoadingSpinner
              size="small"
              message="Generating next story beat..."
            />
          </div>
        </>
      );
    }

    // If we're waiting for the next beat for an exploration beat,
    // just show the loading spinner without resolution details
    if (
      isWaitingForNextBeat &&
      currentBeat &&
      !hasCurrentBeatResolutionDetails
    ) {
      return (
        <>
          <h2 className="text-xl md:text-2xl font-bold text-center text-primary mb-6">
            {currentBeat.title}
          </h2>

          <div className="narrative-container relative">
            {storyState?.generateImages && currentBeat.imageId && (
              <div className="w-full sm:w-64 sm:float-right sm:ml-6 mb-4 aspect-square sm:h-64 max-w-[256px] mx-auto">
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

          {/* Display the selected choice */}
          <div className="space-y-4">
            <div className="mt-6 max-w-2xl mx-auto">
              <div className="bg-white p-4 rounded-lg border-l-8 border border-secondary shadow-md text-lg">
                <div className="flex items-start gap-2">
                  <span className="font-bold text-primary">Choice: </span>
                  <span className="text-primary">
                    {currentBeat.options[currentBeat.choice].text}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center gap-2 mt-6 p-4 bg-white rounded-lg border border-primary-100 shadow-md max-w-2xl mx-auto">
            <LoadingSpinner
              size="small"
              message="Generating next story beat..."
            />
          </div>
        </>
      );
    }

    // Normal beat display
    if (currentBeat && storyState) {
      return (
        <>
          {displayedBeatIndex === 0 && (
            <h1 className="text-2xl md:text-3xl font-bold text-center mb-4 text-primary">
              {storyState.title}
            </h1>
          )}
          <h2 className="text-xl md:text-2xl font-bold text-center text-primary">
            {currentBeat.title}
          </h2>

          {/* Show resolution from previous beat if applicable */}
          {shouldShowPreviousBeatResolution() && displayedBeatIndex && (
            <div className="my-4 max-w-2xl mx-auto">
              {(() => {
                const prevBeat = beatHistory[displayedBeatIndex - 1];
                const prevOption = prevBeat.options[
                  prevBeat.choice
                ] as ChallengeOption;
                const enhancedDetails = enhanceResolutionDetails(
                  prevBeat.resolutionDetails!,
                  prevOption,
                  displayedBeatIndex
                );

                return (
                  <ChallengeResolutionVisualizer
                    resolutionDetails={enhancedDetails}
                    resolution={prevBeat.resolution!}
                    option={prevOption}
                  />
                );
              })()}
            </div>
          )}

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
          {!isWaitingForNextBeat &&
            currentBeat.choice !== -1 &&
            storyState?.pendingPlayers?.length === 0 && (
              <div className="flex items-center justify-center gap-2 mt-6 p-4 bg-white rounded-lg border border-primary-100 shadow-md max-w-2xl mx-auto">
                <LoadingSpinner
                  size="small"
                  message="Generating next story beat..."
                />
              </div>
            )}
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
