import React from "react";
import { PrimaryButton, Icons } from "components/ui";
import { Outcome, PlayerOptionsGeneration, PlayerSlot, Stat } from "core/types";
// MAX_PLAYERS handled within PlayerOutcomesAll
import { OutcomeEditor } from "./OutcomeEditor";
import { useOutcomeEditor } from "../hooks/useOutcomeEditor";
import { OutcomePlayerSection } from "./PlayerOutcomes";

interface OutcomesTabProps {
  outcomes: Outcome[];
  onChange?: (outcomes: Outcome[]) => void;
  readOnly?: boolean;
  // Optional: enable listing/editing player-specific outcomes here too
  playerOptions?: Record<PlayerSlot, PlayerOptionsGeneration>;
  onPlayerOptionsChange?: (
    updates: Record<PlayerSlot, PlayerOptionsGeneration>
  ) => void;
  playerStats?: Stat[];
}

export const OutcomesTab: React.FC<OutcomesTabProps> = ({
  outcomes,
  onChange,
  readOnly = false,
  playerOptions,
  onPlayerOptionsChange,
  playerStats,
}) => {
  const {
    editingOutcomes,
    setEditingOutcomes,
    handleAddOutcome,
    handleUpdateOutcome,
    handleRemoveOutcome,
  } = useOutcomeEditor(outcomes, onChange, readOnly);

  // Determine whether to render player-specific outcomes
  const enablePlayerOutcomes =
    !!playerOptions && !!onPlayerOptionsChange && !!playerStats;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center">
          <h3 className="text-lg font-semibold">Shared Outcomes</h3>
        </div>
        {!readOnly && (
          <PrimaryButton
            variant="outline"
            leftBorder={false}
            size="sm"
            onClick={handleAddOutcome}
            leftIcon={<Icons.Plus className="h-4 w-4" />}
          />
        )}
      </div>

      {outcomes.map((outcome, index) => (
        <OutcomeEditor
          key={outcome.id}
          outcome={outcome}
          index={index}
          editingOutcomes={editingOutcomes}
          setEditingOutcomes={setEditingOutcomes}
          onDelete={() => handleRemoveOutcome(index)}
          onUpdate={(idx, updatedOutcome) =>
            handleUpdateOutcome(idx, updatedOutcome as Outcome)
          }
          readOnly={readOnly}
        />
      ))}

      {enablePlayerOutcomes && playerOptions && onPlayerOptionsChange && (
        <OutcomePlayerSection
          playerOptions={
            playerOptions as Record<PlayerSlot, PlayerOptionsGeneration>
          }
          onPlayerOptionsChange={
            onPlayerOptionsChange as (
              updates: Record<PlayerSlot, PlayerOptionsGeneration>
            ) => void
          }
          playerStats={playerStats as Stat[]}
          readOnly={readOnly}
        />
      )}
    </div>
  );
};
