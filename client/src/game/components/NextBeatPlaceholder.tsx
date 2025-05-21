import React, { useMemo } from "react";
import { LoadingSpinner } from "components/ui";
import { PendingPlayers } from "./PendingPlayers";
import { PreviousChoiceVisualizer } from "./PreviousChoiceVisualizer";
import { Interlude, InterludeItem } from "./Interlude";
import { ClientStateManager } from "core/models/ClientStateManager";
import { ClientStoryState, ImagePlaceholder, Beat } from "core/types";
import { createImageFromPlaceholder } from "shared/utils/imageUtils";
import { enhanceResolutionDetails } from "game/utils/resolutionUtils";

interface NextBeatPlaceholderProps {
  storyState: ClientStoryState;
  previousBeat: Beat; // The beat that just had a choice made
}

export const NextBeatPlaceholder: React.FC<NextBeatPlaceholderProps> = ({
  storyState,
  previousBeat,
}) => {
  // Check if we have valid data to work with
  const isValidData = storyState && previousBeat && previousBeat.choice !== -1;

  // Get selected option and check if it's a challenge beat
  const selectedOption = isValidData
    ? previousBeat.options[previousBeat.choice]
    : undefined;
  const isChallengeBeat = selectedOption?.optionType === "challenge";

  // Enhance resolution details with readable point modifiers if this is a challenge beat
  const enhancedResolutionDetails = useMemo(() => {
    if (
      isValidData &&
      isChallengeBeat &&
      previousBeat.resolutionDetails &&
      selectedOption &&
      selectedOption.optionType === "challenge"
    ) {
      return enhanceResolutionDetails(previousBeat.resolutionDetails);
    }
    return isValidData ? previousBeat.resolutionDetails : undefined;
  }, [isValidData, previousBeat, selectedOption, isChallengeBeat]);

  // If we don't have valid data or no selected option, return null
  if (!isValidData || !selectedOption) return null;

  // Get player slot to show pending players
  const playerSlot = Object.keys(storyState.players)[0];

  // Check if there are any pending players
  const stateManager = new ClientStateManager();
  const hasPendingPlayers = stateManager.hasPendingPlayers(storyState);

  // Process interludes
  const interludesWithImageReferences =
    previousBeat.interludes && Array.isArray(previousBeat.interludes)
      ? previousBeat.interludes.map((interlude) => {
          const item: InterludeItem = { text: interlude.text };

          if (
            interlude.imageId &&
            interlude.imageSource &&
            interlude.imageSource !== "none"
          ) {
            // Check if the image should be shown
            // For generateImages=false, only show existing images
            const imageExists = stateManager.hasImage(
              storyState,
              interlude.imageId,
              interlude.imageSource
            );

            // Skip image if it doesn't exist and generateImages is false
            if (!storyState.generateImages && !imageExists) {
              return item;
            }

            const interludeImagePlaceholder = {
              id: interlude.imageId,
              source: interlude.imageSource,
            } as ImagePlaceholder;

            const image = createImageFromPlaceholder(
              interludeImagePlaceholder,
              storyState
            );

            if (image) {
              item.imageReference = image;
            }
          }

          return item;
        })
      : [];

  return (
    <>
      {/* Show the previous beat's choice with animation if it was a challenge */}
      <PreviousChoiceVisualizer
        choice={selectedOption}
        resolution={previousBeat.resolution || undefined}
        resolutionDetails={enhancedResolutionDetails}
        animateRoll={isChallengeBeat}
        forceExpanded={true}
      />

      {/* Show interludes from the previous beat if available */}
      {previousBeat.interludes &&
        Array.isArray(previousBeat.interludes) &&
        previousBeat.interludes.length > 0 && (
          <Interlude interludes={interludesWithImageReferences} />
        )}

      {/* Loading spinner view */}
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
          <div className="mt-4 flex justify-center">
            <div className="inline-block">
              <PendingPlayers
                pendingPlayers={storyState.pendingPlayers}
                numberOfPlayers={stateManager.getNumberOfPlayers(storyState)}
                currentPlayer={playerSlot}
              />
            </div>
          </div>
        )}
      </div>
    </>
  );
};
