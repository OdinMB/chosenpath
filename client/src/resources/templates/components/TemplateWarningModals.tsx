import React from "react";
import { GameModes } from "core/types";
import { PrimaryButton } from "components/ui";
import { AcademyModal } from "shared/components/AcademyModal";

interface TemplateWarningModalsProps {
  // Multiplayer mode warning
  showMultiplayerWarning: boolean;
  pendingGameModeChange: {
    newMode: GameModes;
    oldMode: GameModes;
    value: number;
  } | null;
  handleMultiplayerWarningCancel: () => void;
  handleMultiplayerWarningProceed: () => void;

  // Player count warning
  showPlayerCountWarning: boolean;
  pendingPlayerCountChange: {
    newMin: number;
    newMax: number;
    oldMin: number;
    oldMax: number;
    isMinChange: boolean;
  } | null;
  handlePlayerCountWarningCancel: () => void;
  handlePlayerCountWarningProceed: () => void;

  // Competitive single player warning
  showCompetitiveSingleWarning: boolean;
  handleCompetitiveSingleWarningCancel: () => void;
  handleCompetitiveSingleWarningProceed: () => void;
}

export const TemplateWarningModals: React.FC<TemplateWarningModalsProps> = ({
  showMultiplayerWarning,
  pendingGameModeChange,
  handleMultiplayerWarningCancel,
  handleMultiplayerWarningProceed,
  showPlayerCountWarning,
  pendingPlayerCountChange,
  handlePlayerCountWarningCancel,
  handlePlayerCountWarningProceed,
  showCompetitiveSingleWarning,
  handleCompetitiveSingleWarningCancel,
  handleCompetitiveSingleWarningProceed,
}) => {
  return (
    <>
      {/* Multiplayer mode change warning modal */}
      <AcademyModal
        isOpen={showMultiplayerWarning}
        onClose={handleMultiplayerWarningCancel}
        width="lg"
        showVisitButton={false}
        content={
          pendingGameModeChange && (
            <div className="space-y-4">
              <div className="font-semibold text-lg text-center">
                Multiplayer Mode Change Warning
              </div>
              <div>
                Changing the multiplayer mode to{" "}
                <strong>
                  {pendingGameModeChange.newMode === GameModes.Cooperative
                    ? "Cooperative"
                    : pendingGameModeChange.newMode ===
                      GameModes.CooperativeCompetitive
                    ? "Cooperative with Personal Outcomes"
                    : "Competitive"}
                </strong>{" "}
                changes the fundamental structure of your World. Chances are
                that you will have to adjust Guidelines, Story Elements, Stats,
                and Outcomes to better align with the new setting.
              </div>
              <div className="flex gap-2 justify-center pt-4">
                <PrimaryButton
                  onClick={handleMultiplayerWarningCancel}
                  variant="outline"
                >
                  Cancel
                </PrimaryButton>
                <PrimaryButton
                  onClick={handleMultiplayerWarningProceed}
                  variant="primary"
                >
                  Continue
                </PrimaryButton>
              </div>
            </div>
          )
        }
      />

      {/* Player count change warning modal */}
      <AcademyModal
        isOpen={showPlayerCountWarning}
        onClose={handlePlayerCountWarningCancel}
        width="lg"
        showVisitButton={false}
        content={
          pendingPlayerCountChange && (
            <div className="space-y-4">
              <div className="font-semibold text-lg text-center">
                Single to Multiplayer Context Warning
              </div>
              <div>
                Changing the World from a single-player context to a (potential)
                multiplayer environment means you should create Identities,
                Backgrounds, and potentially personal Outcomes for Player 2{" "}
                {pendingPlayerCountChange.newMax > 2 && (
                  <span>and Player 3</span>
                )}
                . Check if you categorized Outcomes correctly as Shared Outcomes
                vs. Personal Outcomes.
              </div>
              <div className="flex gap-2 justify-center pt-4">
                <PrimaryButton
                  onClick={handlePlayerCountWarningCancel}
                  variant="outline"
                >
                  Cancel
                </PrimaryButton>
                <PrimaryButton
                  onClick={handlePlayerCountWarningProceed}
                  variant="primary"
                >
                  Continue
                </PrimaryButton>
              </div>
            </div>
          )
        }
      />

      {/* Competitive single player warning modal */}
      <AcademyModal
        isOpen={showCompetitiveSingleWarning}
        onClose={handleCompetitiveSingleWarningCancel}
        width="lg"
        showVisitButton={false}
        content={
          <div className="space-y-4">
            <div className="font-semibold text-lg text-center">
              Competitive Single Player Warning
            </div>
            <div>
              You defined your World as a competitive space for your players. If
              you want to allow a single player to experience this World, make
              sure that everything works as intended -- even without another
              player as a competitor.
            </div>
            <div className="flex gap-2 justify-center pt-4">
              <PrimaryButton
                onClick={handleCompetitiveSingleWarningCancel}
                variant="outline"
              >
                Cancel
              </PrimaryButton>
              <PrimaryButton
                onClick={handleCompetitiveSingleWarningProceed}
                variant="primary"
              >
                Continue
              </PrimaryButton>
            </div>
          </div>
        }
      />
    </>
  );
};
