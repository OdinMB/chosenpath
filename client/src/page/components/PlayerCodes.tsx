import { useState, useEffect } from "react";
import { useSession } from "shared/useSession";
import { deleteCodeSetsByContent } from "shared/utils/codeSetUtils";
import { LoadingSpinner, PrimaryButton } from "components/ui";
import { PlayerCode } from "shared/components";
import { StoryTemplate } from "core/types";
import { Icons } from "shared/components/ui/Icons";
import { ImageCard } from "shared/components/ImageCard";

interface PlayerCodesProps {
  codes: Record<string, string>;
  onCodeSubmit: (code: string) => void;
  storyReady: boolean;
  onGoToWelcome?: () => void;
  template?: StoryTemplate;
}

export function PlayerCodes({
  codes,
  onCodeSubmit,
  storyReady,
  onGoToWelcome,
  template,
}: PlayerCodesProps) {
  const [timeSinceLoad, setTimeSinceLoad] = useState(0);
  const { contentModeration } = useSession();

  useEffect(() => {
    if (
      !!contentModeration &&
      typeof contentModeration === "object" &&
      "reason" in contentModeration
    ) {
      console.log(
        "Received content moderation response. Deleting codes and leaving."
      );
      // delete codes from session and local storage
      deleteCodeSetsByContent(codes);
      // leave this view
      onGoToWelcome?.();
    }
  }, [contentModeration, onGoToWelcome, codes]);

  const FALLBACK_READY_TIME = 60; // in seconds

  // If the story isn't marked ready by the server after 60 seconds,
  // assume it's probably ready but we missed the notification
  const isLikelyReady = !storyReady && timeSinceLoad >= FALLBACK_READY_TIME;

  // Story is ready to join only if explicitly marked ready or fallback timeout reached
  const isReadyToJoin = storyReady || isLikelyReady;

  useEffect(() => {
    // Don't start the timer if the story is already ready
    if (isReadyToJoin) return;

    const interval = setInterval(() => {
      setTimeSinceLoad((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [isReadyToJoin]);

  const formatPlayerName = (slot: string) => {
    // Convert "player1" to "Player 1"
    return slot.replace(/player(\d+)/, (_, num) => `Player ${num}`);
  };

  const isSinglePlayer = Object.keys(codes).length === 1;
  const singlePlayerCode = isSinglePlayer ? Object.values(codes)[0] : null;
  const defaultCodeToUse = Object.values(codes)[0] || "";

  // Render the list of codes
  const renderCodesList = () => {
    if (isSinglePlayer) {
      return (
        <div className="mb-5 text-center">
          <div className="text-primary-700 text-sm mb-1">Your Access Code:</div>
          <div className="flex justify-center">
            <PlayerCode code={singlePlayerCode!} size="lg" />
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-4 mb-6">
        {Object.entries(codes).map(([slot, code]) => (
          <div
            key={slot}
            className="border rounded-lg p-4 bg-white border-primary-100 shadow-sm"
          >
            <h3 className="font-medium text-primary mb-2">
              {formatPlayerName(slot)}
            </h3>
            <PlayerCode code={code} />
          </div>
        ))}
      </div>
    );
  };

  // Save codes message
  const renderSaveCodesMessage = () => {
    if (!isSinglePlayer) {
      return (
        <div className="bg-primary-50 border-l-4 border-primary-200 p-4 mb-6 rounded-md">
          <div className="flex">
            <p className="text-sm text-primary-700">
              Send invite links (
              <Icons.Share className="h-3.5 w-3.5 inline" />) to the other
              players.
            </p>
          </div>
        </div>
      );
    }
    return null;
  };

  // Warning when story is likely ready but not confirmed
  const renderLikelyReadyWarning = () => {
    if (isLikelyReady) {
      return (
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6 rounded-md">
          <div className="flex">
            <div className="flex-shrink-0">
              <Icons.Warning className="h-5 w-5 text-yellow-400" />
            </div>
            <div className="ml-3">
              <p className="text-sm text-yellow-700">
                Your story is probably ready, but we couldn't confirm with the
                server. Try joining now, or{" "}
                <button
                  onClick={onGoToWelcome}
                  className="text-accent underline hover:text-accent-dark"
                >
                  return to Welcome screen
                </button>{" "}
                and try again in one minute. Your access code has been saved to
                your browser and will remain valid.
              </p>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  // Loading spinner when story is not ready
  const renderLoadingSpinner = () => {
    if (!isReadyToJoin) {
      return (
        <div className="mb-4 text-center">
          <LoadingSpinner message="Creating your story. This should take less than a minute..." />
        </div>
      );
    }
    return null;
  };

  // Begin button
  const renderBeginButton = () => {
    return (
      <PrimaryButton
        onClick={() => onCodeSubmit(defaultCodeToUse)}
        fullWidth
        size="lg"
        disabled={!isReadyToJoin}
        title={!isReadyToJoin ? "Please wait for your story to be ready" : ""}
        className="px-4 max-w-[200px] mx-auto mb-0"
      >
        {isReadyToJoin ? (
          <span className="font-bold">Begin</span>
        ) : (
          "Waiting..."
        )}
      </PrimaryButton>
    );
  };

  // All codes, message and button in one component
  const CodesAndButtons = () => (
    <>
      {template && (
        <h3 className="text-lg text-primary-800 font-medium mb-4">
          {template.title}
        </h3>
      )}
      {renderSaveCodesMessage()}
      {renderCodesList()}
      {renderLoadingSpinner()}
      {renderBeginButton()}
    </>
  );

  return (
    <div className="p-4 font-lora">
      <div className="max-w-2xl mx-auto">
        {renderLikelyReadyWarning()}

        {template ? (
          <ImageCard
            sourceId={template.id}
            title={template.title}
            size="large"
            onClick={() => isReadyToJoin && onCodeSubmit(defaultCodeToUse)}
          >
            <CodesAndButtons />
          </ImageCard>
        ) : (
          <div className="text-center">
            <CodesAndButtons />
          </div>
        )}
      </div>
    </div>
  );
}
