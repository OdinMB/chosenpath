import React from "react";
import ReactMarkdown from "react-markdown";
import type { ComponentType } from "react";
import { useSession } from "shared/useSession";
import { BeatHistory } from "./BeatHistory";
import { PreviousChoiceVisualizer } from "./PreviousChoiceVisualizer";
import { BeatFeedback } from "./feedback/BeatFeedback";
import { PendingPlayers } from "./PendingPlayers.js";
import type {
  ChallengeOption,
  ResolutionDetails,
  ImagePlaceholder,
} from "core/types";
import { ClientStateManager } from "core/models/ClientStateManager";
import {
  POINTS_FOR_FAVORABLE_RESOLUTION,
  POINTS_FOR_MIXED_RESOLUTION,
  POINTS_FOR_UNFAVORABLE_RESOLUTION,
} from "core/config";
import { LoadingSpinner, PrimaryButton, ColoredBox } from "components/ui";
import { StoryImage } from "shared/components/StoryImage";
import {
  IMAGE_PLACEHOLDER_REGEX,
  parseImagePlaceholder,
  createImageFromPlaceholder,
} from "shared/utils/imageUtils";
import { ClientStoryState } from "core/types";
import { Interlude, InterludeItem } from "./Interlude";

interface StoryDisplayProps {
  onChoiceSelected: (index: number) => void;
}

export function StoryDisplay({ onChoiceSelected }: StoryDisplayProps) {
  const { storyState, isLoading, isRequestPending } = useSession();
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

  // Reset the selected choice and displayed beat index when a new beat arrives
  React.useEffect(() => {
    const currentBeatCount = beatHistory.length;
    if (currentBeatCount !== previousBeatCount) {
      setLocalSelectedChoice(undefined);
      setPreviousBeatCount(currentBeatCount);

      // Always navigate to the latest beat when a new one arrives
      setDisplayedBeatIndex(currentBeatCount - 1);
      setShowNextBeatPlaceholder(false);

      // Ensure we scroll to the top
      if (contentRef.current) {
        contentRef.current.scrollTop = 0;
      }
      window.scrollTo(0, 0);
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
  const latestBeat =
    beatHistory.length > 0 ? beatHistory[beatHistory.length - 1] : null;

  // Track when a choice is successfully processed by the server
  React.useEffect(() => {
    // If the server confirmed our choice (it's in the story state)
    // and we're viewing the latest beat, show the next beat placeholder
    if (
      localSelectedChoice !== undefined &&
      !showNextBeatPlaceholder &&
      isViewingLatestBeat
    ) {
      const latestBeat = beatHistory[beatHistory.length - 1];
      // Check if the server has confirmed our choice (choice is set in the beat)
      if (latestBeat && latestBeat.choice !== -1) {
        console.log(
          "[StoryDisplay] Choice confirmed by server, showing next beat placeholder"
        );
        setShowNextBeatPlaceholder(true);
        setDisplayedBeatIndex(beatHistory.length);
      }
    }
  }, [
    localSelectedChoice,
    showNextBeatPlaceholder,
    beatHistory,
    isViewingLatestBeat,
  ]);

  // Reset local choice when a rate limit occurs or an error happens
  React.useEffect(() => {
    // If we have a local choice but the server isn't processing it anymore
    // (either rejected or rate-limited), and we're still waiting at the placeholder
    const isPendingRequest = isRequestPending("make_choice");

    if (!isPendingRequest && localSelectedChoice !== undefined) {
      // Check if the server actually confirmed our choice (it would be in the beat history)
      const latestBeat = beatHistory[beatHistory.length - 1];
      const serverConfirmedChoice = latestBeat && latestBeat.choice !== -1;

      if (!serverConfirmedChoice) {
        console.log(
          "[StoryDisplay] Resetting local choice due to request failure or rate limit"
        );
        setLocalSelectedChoice(undefined);
        setShowNextBeatPlaceholder(false);

        // Go back to the current beat
        setDisplayedBeatIndex(beatHistory.length - 1);
      }
    }
  }, [
    isRequestPending,
    localSelectedChoice,
    displayedBeatIndex,
    beatHistory,
    showNextBeatPlaceholder,
  ]);

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

  // Check if feedback should be shown for the current beat
  const shouldShowFeedback = () => {
    // Don't show feedback if there's no current beat
    if (!currentBeat) return false;

    // Don't show feedback for placeholder beats
    if (showNextBeatPlaceholder) return false;

    // Always show feedback for beats with content
    return true;
  };

  const handleChoiceClick = (index: number) => {
    // Only allow a choice on the latest beat if it doesn't have a choice yet
    if (
      !isViewingLatestBeat ||
      (latestBeat && latestBeat.choice !== -1) ||
      localSelectedChoice !== undefined ||
      isRequestPending("make_choice")
    )
      return;

    // Set the local choice and notify the parent
    setLocalSelectedChoice(index);
    onChoiceSelected(index);

    console.log(
      "[StoryDisplay] Choice selected, waiting for server confirmation"
    );
  };

  const renderOptions = () => {
    if (!currentBeat || storyState?.gameOver) {
      return null;
    }

    // Show options if no choice has been confirmed by the server
    return (
      <div className="space-y-4">
        <div className="mt-6 space-y-3 max-w-2xl mx-auto">
          {currentBeat.options.map((option, index) => (
            <PrimaryButton
              key={index}
              onClick={() => handleChoiceClick(index)}
              size="lg"
              textAlign="left"
              className={`w-full text-lg md:text-xl p-6 ${
                localSelectedChoice === index ? "opacity-70 bg-primary-50" : ""
              }`}
              disabled={
                isRequestPending("make_choice") ||
                localSelectedChoice !== undefined
              }
            >
              {option.text}
            </PrimaryButton>
          ))}
          {localSelectedChoice !== undefined && (
            <div className="text-center text-primary-600 mt-4">
              {isRequestPending("make_choice")
                ? "Processing your choice..."
                : storyState?.pendingPlayers &&
                  Object.keys(storyState.pendingPlayers).length > 0
                ? "Waiting for other players..."
                : "Waiting for server response..."}
            </div>
          )}
        </div>
      </div>
    );
  };

  // Helper function to render a previous beat's choice using the PreviousChoiceVisualizer
  const renderPreviousChoice = (
    prevBeatIndex: number,
    animateRoll: boolean = false,
    forceExpanded: boolean = false
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
        forceExpanded={forceExpanded}
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
          <ColoredBox colorType="tertiary" className="p-4 text-lg">
            <div className="flex items-start">
              <span className="text-primary">
                {beat.options[choiceIndex].text}
              </span>
            </div>
          </ColoredBox>
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

    // Check if this was a challenge beat that should animate
    const selectedOption = prevBeat.options[prevBeat.choice];
    const isChallengeBeat = selectedOption?.optionType === "challenge";

    // Get player slot to show pending players
    const playerSlot = Object.keys(storyState.players)[0];

    // Check if there are any pending players
    const stateManager = new ClientStateManager();
    const hasPendingPlayers = stateManager.hasPendingPlayers(storyState);

    const interludesWithImageReferences = prevBeat.interludes.map(
      (interlude) => {
        const interludeImagePlaceholder = {
          id: interlude.imageId,
          source: interlude.imageSource,
        } as ImagePlaceholder;
        return {
          imageReference: createImageFromPlaceholder(
            interludeImagePlaceholder,
            storyState
          ),
          text: interlude.text,
        } as InterludeItem;
      }
    );

    return (
      <>
        {/* Show the previous beat's choice with animation if it was a challenge */}
        {renderPreviousChoice(prevBeatIndex, isChallengeBeat, true)}

        {/* Show interludes from the previous beat if available */}
        {prevBeat.interludes && prevBeat.interludes.length > 0 && (
          <Interlude interludes={interludesWithImageReferences} />
        )}

        {/* New cleaner loading view instead of skeleton */}
        <div className="items-center justify-center p-4">
          {/* Show "Writing the story..." only when there are no pending players */}
          {!hasPendingPlayers && (
            <h1 className="text-2xl font-bold mb-6 text-primary self-center text-center hidden">
              Writing the story...
            </h1>
          )}

          <LoadingSpinner size="large" message="" />

          {/* Only show pending players list when there are actually pending players */}
          {hasPendingPlayers && (
            <div className="mt-4 w-full max-w-md">
              <PendingPlayers
                pendingPlayers={storyState.pendingPlayers}
                numberOfPlayers={stateManager.getNumberOfPlayers(storyState)}
                currentPlayer={playerSlot}
              />
            </div>
          )}
        </div>
      </>
    );
  };

  // Regular render beat content function
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
            <div className="narrative-text text-base md:text-lg [&>p]:mb-4 text-primary">
              {renderBeatTextWithImages(currentBeat.text, storyState)}
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

  // Function to render beat text with embedded images
  const renderBeatTextWithImages = (
    text: string,
    storyState: ClientStoryState
  ) => {
    // Fix potential encoding issues by normalizing the text
    text = text.normalize();

    const stateManager = new ClientStateManager();
    const storyIncludesImages = stateManager.includesImages(storyState);

    // If no images in story state, just render the markdown
    if (!storyIncludesImages) {
      return React.createElement(
        ReactMarkdown as ComponentType<{
          children: string;
          breaks?: boolean;
        }>,
        { breaks: true, children: text }
      );
    }

    // Check if text contains image placeholders
    const matches = text.match(IMAGE_PLACEHOLDER_REGEX);

    // If no matches found, use standard markdown
    if (!matches) {
      return React.createElement(
        ReactMarkdown as ComponentType<{
          children: string;
          breaks?: boolean;
        }>,
        { breaks: true, children: text }
      );
    }

    // First, render all images and store them with their positions
    const imageElements: Array<{
      position: number;
      element: React.ReactNode;
      placeholder: string;
    }> = [];

    matches.forEach((match, index) => {
      const imagePlaceholder = parseImagePlaceholder(match);
      const finalImage = createImageFromPlaceholder(
        imagePlaceholder,
        storyState
      );
      if (finalImage) {
        console.log("Rendering image with attributes:", imagePlaceholder);
        imageElements.push({
          position: text.indexOf(match),
          placeholder: match,
          element: (
            <StoryImage
              key={`img-${index}`}
              image={finalImage}
              alt={finalImage.description || ""}
              caption={finalImage.description || ""}
              withinText={true}
              float={(imagePlaceholder.float as "left" | "right") || "left"}
            />
          ),
        });
      } else {
        console.log("No image found for", match);
      }
    });

    // Sort images by their position in the text
    imageElements.sort((a, b) => a.position - b.position);

    // Split text into segments at image positions while preserving the original text
    const segments: Array<{
      type: "text" | "image";
      content: string | React.ReactNode;
    }> = [];
    let lastIndex = 0;

    imageElements.forEach(({ position, element, placeholder }) => {
      // Add text segment before the image
      if (position > lastIndex) {
        segments.push({
          type: "text",
          content: text.slice(lastIndex, position),
        });
      }
      // Add the image
      segments.push({
        type: "image",
        content: element,
      });
      lastIndex = position + placeholder.length;
    });

    // Add remaining text after last image
    if (lastIndex < text.length) {
      segments.push({
        type: "text",
        content: text.slice(lastIndex),
      });
    }

    // Render segments
    const elements = segments.map((segment, index) => {
      if (segment.type === "text") {
        return React.createElement(
          ReactMarkdown as ComponentType<{
            children: string;
            components?: Record<
              string,
              React.ComponentType<{ children: React.ReactNode }>
            >;
          }>,
          {
            key: `text-${index}`,
            children: segment.content as string,
            components: {
              p: ({ children }) => (
                <p className="mb-4 text-base md:text-lg">{children}</p>
              ),
            },
          }
        );
      } else {
        return segment.content;
      }
    });

    return (
      <div className="relative narrative-text [&>*]:mb-4 last:[&>*]:mb-0">
        {elements}
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
            pendingBeat={showNextBeatPlaceholder}
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
