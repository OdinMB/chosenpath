import { useState, useEffect } from "react";
import { useSession } from "shared/useSession";
import { deleteCodeSetsByContent } from "shared/codeSetUtils";
import { LoadingSpinner, PrimaryButton } from "components/ui";
import { PlayerCode } from "shared/components";

interface PlayerCodesProps {
  codes: Record<string, string>;
  onBack: () => void;
  onCodeSubmit: (code: string) => void;
  storyReady: boolean;
  onGoToWelcome?: () => void;
}

export function PlayerCodes({
  codes,
  onBack,
  onCodeSubmit,
  storyReady,
  onGoToWelcome,
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
      onBack();
    }
  }, [contentModeration, onBack, codes]);

  const FALLBACK_READY_TIME = 60; // in seconds

  // If the story isn't marked ready by the server after 60 seconds,
  // assume it's probably ready but we missed the notification
  const isLikelyReady = !storyReady && timeSinceLoad >= FALLBACK_READY_TIME;

  // Story is ready to join only if explicitly marked ready or fallback timeout reached
  const isReadyToJoin = storyReady || isLikelyReady;

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeSinceLoad((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const formatPlayerName = (slot: string) => {
    // Convert "player1" to "Player 1"
    return slot.replace(/player(\d+)/, (_, num) => `Player ${num}`);
  };

  const isSinglePlayer = Object.keys(codes).length === 1;
  const singlePlayerCode = isSinglePlayer ? Object.values(codes)[0] : null;

  return (
    <div className="p-4 md:p-6 font-lora">
      <div className="max-w-2xl mx-auto">
        <div className="p-6 bg-white rounded-lg border border-primary-100 shadow-md mb-6">
          {isLikelyReady && (
            <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6 rounded-md">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg
                    className="h-5 w-5 text-yellow-400"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-yellow-700">
                    Your story is probably ready, but we couldn't confirm with
                    the server. Try joining now, or{" "}
                    <button
                      onClick={onGoToWelcome}
                      className="text-accent underline hover:text-accent-dark"
                    >
                      return to Welcome screen
                    </button>{" "}
                    and try again in one minute. Your access code has been saved
                    to your browser and will remain valid.
                  </p>
                </div>
              </div>
            </div>
          )}

          {!isSinglePlayer && (
            <div className="bg-primary-50 border-l-4 border-primary-200 p-4 mb-6 rounded-md">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg
                    className="h-5 w-5 text-primary-600"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-primary-700">
                    Save these codes! Each player will need their code to access
                    their character. You can also share join links with other
                    players.
                  </p>
                </div>
              </div>
            </div>
          )}

          {isSinglePlayer ? (
            <>
              <div className="mb-8 text-center">
                <div className="mb-2 text-primary-700 text-sm">
                  Your Access Code:
                </div>
                <div className="flex justify-center">
                  <PlayerCode code={singlePlayerCode!} size="lg" />
                </div>
              </div>

              {!isReadyToJoin && (
                <div className="mb-4 text-center">
                  <LoadingSpinner message="Creating your story. This should take less than a minute..." />
                </div>
              )}

              <div className="flex flex-row gap-3 pt-2">
                <PrimaryButton
                  onClick={onBack}
                  variant="outline"
                  leftBorder={false}
                  size="lg"
                >
                  Back
                </PrimaryButton>

                <PrimaryButton
                  onClick={() => onCodeSubmit(singlePlayerCode!)}
                  fullWidth
                  size="lg"
                  disabled={!isReadyToJoin}
                  title={
                    !isReadyToJoin
                      ? "Please wait for your story to be ready"
                      : ""
                  }
                >
                  {isReadyToJoin ? "Join the Story" : "Waiting for Story..."}
                </PrimaryButton>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-4 mb-8">
                {Object.entries(codes).map(([slot, code]) => (
                  <div
                    key={slot}
                    className="border rounded-lg p-4 bg-white border-primary-100 shadow-sm"
                  >
                    <h3 className="font-medium text-primary mb-2">
                      {formatPlayerName(slot)}
                    </h3>
                    <div className="flex items-center justify-between">
                      <PlayerCode code={code} />
                      <PrimaryButton
                        onClick={() => onCodeSubmit(code)}
                        className="ml-4"
                        disabled={!isReadyToJoin}
                        title={
                          !isReadyToJoin
                            ? "Please wait for your story to be ready"
                            : ""
                        }
                      >
                        {isReadyToJoin ? "Join the Story" : "Waiting..."}
                      </PrimaryButton>
                    </div>
                  </div>
                ))}
              </div>

              {!isReadyToJoin && (
                <div className="mb-4 text-center">
                  <LoadingSpinner message="Creating your story. This should take less than a minute..." />
                </div>
              )}

              <div className="flex justify-center">
                <PrimaryButton
                  onClick={onBack}
                  variant="outline"
                  leftBorder={false}
                >
                  Back
                </PrimaryButton>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
