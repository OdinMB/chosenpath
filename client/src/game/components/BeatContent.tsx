import React from "react";
import ReactMarkdown from "react-markdown";
import { BeatFeedback } from "./feedback/BeatFeedback";
import { PreviousChoiceVisualizer } from "./PreviousChoiceVisualizer";
import { LoadingSpinner, PrimaryButton, ColoredBox } from "components/ui";
import { ClientStoryState, Beat, BeatOption } from "core/types";
import { processStoryText } from "client/game/utils/storyTextProcessor";
import { enhanceResolutionDetails } from "../utils/resolutionUtils";

interface BeatContentProps {
  storyState: ClientStoryState;
  currentBeat: Beat | null;
  previousBeatIndex: number | null;
  displayedBeatIndex: number | null;
  beatHistory: Beat[];
  isViewingLatestBeat: boolean;
  localSelectedChoice: number | undefined;
  isRequestPending: (action: string) => boolean;
  onChoiceSelected: (index: number) => void;
}

/**
 * Component for displaying a single story beat's content
 */
export const BeatContent: React.FC<BeatContentProps> = ({
  storyState,
  currentBeat,
  previousBeatIndex,
  displayedBeatIndex,
  beatHistory,
  isViewingLatestBeat,
  localSelectedChoice,
  isRequestPending,
  onChoiceSelected,
}) => {
  // Check if feedback should be shown for the current beat
  const shouldShowFeedback = () => {
    // Don't show feedback if there's no current beat
    if (!currentBeat) return false;

    // Always show feedback for beats with content
    return true;
  };

  // Handle a choice being clicked
  const handleChoiceClick = (index: number) => {
    // Only allow a choice on the latest beat if it doesn't have a choice yet
    if (
      !isViewingLatestBeat ||
      (currentBeat && currentBeat.choice !== -1) ||
      localSelectedChoice !== undefined ||
      isRequestPending("make_choice")
    )
      return;

    // Notify parent component
    onChoiceSelected(index);
  };

  // Render the previous beat's choice visualization
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
      resolutionDetails = enhanceResolutionDetails(prevBeat.resolutionDetails);
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

  // Render the locked-in choice for historical or completed beats
  const renderLockedInChoice = (
    beat: {
      options: Array<{ text: string }>;
      choice: number;
    },
    choiceIndex: number
  ) => {
    if (choiceIndex === -1 || !beat || !beat.options) return null;

    return (
      <div className="space-y-4 relative">
        {/* Add a clear separator above the locked-in choice */}
        <div className="clear-both w-full h-1"></div>
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

  // Render the options as buttons for the latest beat
  const renderOptions = () => {
    if (!currentBeat || storyState?.gameOver) {
      return null;
    }

    // Show options if no choice has been confirmed by the server
    return (
      <div className="space-y-4 relative">
        {/* Add a clear separator above the options */}
        <div className="clear-both w-full h-1"></div>
        <div className="mt-6 space-y-3 max-w-2xl mx-auto">
          {currentBeat.options.map((option: BeatOption, index: number) => (
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

  // Function to render beat text with embedded images
  const renderBeatTextWithImages = (
    text: string,
    storyState: ClientStoryState
  ) => {
    // Process the text to handle images
    const segments = processStoryText(text, storyState);

    // Render segments
    const elements = segments.map((segment, index) => {
      if (segment.type === "text") {
        return React.createElement(
          ReactMarkdown as React.ComponentType<{
            children: string;
            components?: Record<
              string,
              React.ComponentType<{ children: React.ReactNode }>
            >;
            breaks?: boolean;
          }>,
          {
            key: `text-${index}`,
            children: segment.content as string,
            components: {
              p: ({ children }) => (
                <p className="mb-4 text-base md:text-lg">{children}</p>
              ),
            },
            // Enable line breaks for proper paragraph rendering
            breaks: true,
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

  if (!currentBeat || !storyState) {
    // Loading the first beat
    if (storyState?.characterSelectionCompleted) {
      return (
        <div className="h-full flex items-center justify-center py-8">
          <div className="text-center p-6 bg-white rounded-lg border border-primary-100 shadow-md">
            <LoadingSpinner size="large" message="Setting up the story..." />
          </div>
        </div>
      );
    }
    return null;
  }

  return (
    <>
      {/* Show previous beat's choice at the top if it exists */}
      {displayedBeatIndex !== null &&
        displayedBeatIndex > 0 &&
        previousBeatIndex !== null &&
        renderPreviousChoice(previousBeatIndex)}

      {/* Show story title on first beat */}
      {displayedBeatIndex === 0 && (
        <h1 className="text-2xl md:text-3xl font-bold text-center mb-4 text-primary">
          {storyState.title}
        </h1>
      )}

      {/* Show beat title */}
      <h2 className="text-xl md:text-2xl font-bold text-center text-primary">
        {currentBeat.title}
      </h2>

      {/* Main narrative content */}
      <div className="narrative-container relative">
        <div className="narrative-text text-base md:text-lg [&>p]:mb-4 text-primary">
          {renderBeatTextWithImages(currentBeat.text, storyState)}
        </div>
      </div>

      {/* Add feedback for the beat */}
      <div className="mt-4 mb-4">
        {shouldShowFeedback() && <BeatFeedback storyText={currentBeat.text} />}
      </div>

      {/* For historical beats or the current beat with a choice, show the locked-in choice */}
      {(!isViewingLatestBeat || currentBeat.choice !== -1) &&
        renderLockedInChoice(
          currentBeat,
          currentBeat.choice !== -1 ? currentBeat.choice : localSelectedChoice!
        )}

      {/* For the latest beat with no choice, render options as buttons */}
      {isViewingLatestBeat &&
        currentBeat.choice === -1 &&
        localSelectedChoice === undefined &&
        renderOptions()}
    </>
  );
};
