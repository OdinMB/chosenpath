import { LoadingSpinner, PrimaryButton } from "components/ui";
import { PlayerCode } from "shared/components";
import { StoryTemplate } from "core/types";
import { Icons } from "shared/components/ui/Icons";
import { CoverCard } from "shared/components/CoverCard";
import { GenerationProgress } from "./GenerationProgress";

interface PlayerCodesProps {
  codes: Record<string, string>;
  onCodeSubmit: (code: string) => void;
  storyReady: boolean;
  template?: StoryTemplate;
  showGenerationProgress?: boolean; // When true, show GenerationProgress instead of old loading spinner
}

export function PlayerCodes({
  codes,
  onCodeSubmit,
  storyReady,
  template,
  showGenerationProgress = false,
}: PlayerCodesProps) {
  // Story is ready to join only when the server confirms it
  const isReadyToJoin = storyReady;

  const formatPlayerName = (slot: string) => {
    // Convert "player1" to "Player 1"
    return slot.replace(
      /player(\d+)/,
      (_, num) => `Player ${num}${num == 1 ? " (You)" : ""}`
    );
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


  // Loading display when story is not ready
  const renderLoadingDisplay = () => {
    if (!isReadyToJoin) {
      if (showGenerationProgress) {
        return (
          <div className="mb-6">
            <GenerationProgress isVisible={true} templateMode={false} />
          </div>
        );
      } else {
        return (
          <div className="mb-4 text-center">
            <LoadingSpinner message="Creating your story. This may take a few minutes." />
          </div>
        );
      }
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
      {renderLoadingDisplay()}
      {renderBeginButton()}
    </>
  );

  return (
    <div className="p-4 font-lora">
      <div className="max-w-2xl mx-auto">

        {template ? (
          <CoverCard
            sourceId={template.id}
            title={template.title}
            size="large"
            onClick={() => isReadyToJoin && onCodeSubmit(defaultCodeToUse)}
          >
            <CodesAndButtons />
          </CoverCard>
        ) : (
          <div className="text-center">
            <CodesAndButtons />
          </div>
        )}
      </div>
    </div>
  );
}
