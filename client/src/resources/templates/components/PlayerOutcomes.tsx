import React from "react";
import { PlayerOptionsGeneration, PlayerSlot, Stat, Outcome } from "core/types";
import { MAX_PLAYERS } from "core/config";
import { PrimaryButton, Icons, Select } from "components/ui";
import { OutcomeEditor } from "./OutcomeEditor";
import { usePlayerEditor } from "../hooks/usePlayerEditor";

// Managed section: renders outcomes for all players and manages its own state via usePlayerEditor
interface PlayerOutcomesAllProps {
  playerOptions: Record<PlayerSlot, PlayerOptionsGeneration>;
  onPlayerOptionsChange: (
    updates: Record<PlayerSlot, PlayerOptionsGeneration>
  ) => void;
  playerStats: Stat[];
  readOnly?: boolean;
}

export const OutcomePlayerSection: React.FC<PlayerOutcomesAllProps> = ({
  playerOptions,
  onPlayerOptionsChange,
  playerStats,
  readOnly = false,
}) => {
  const {
    editingOutcomes,
    setEditingOutcomes,
    handleAddPlayerOutcome,
    handleCopyOutcome,
    handleUpdateOutcome,
    handleDeleteOutcome,
  } = usePlayerEditor(
    playerOptions,
    onPlayerOptionsChange,
    playerStats,
    readOnly
  );

  return (
    <div className="mt-8 space-y-6">
      <div className="flex items-center">
        <h3 className="text-lg font-semibold mt-4">Player-specific Outcomes</h3>
      </div>

      {Array.from({ length: MAX_PLAYERS }, (_, i) => {
        const slot = `player${i + 1}` as PlayerSlot;
        const outcomesForPlayer = playerOptions[slot]?.outcomes || [];
        const copySources = Object.entries(playerOptions).filter(
          ([otherSlot, otherOptions]) =>
            otherSlot !== slot && (otherOptions?.outcomes || []).length > 0
        );
        const hasCopySources = copySources.length > 0;

        return (
          <div key={slot} className="space-y-3">
            <div className="flex justify-between items-center">
              <h4 className="font-medium">Player {i + 1}</h4>
              {!readOnly && (
                <div className="flex gap-2 items-center">
                  <PrimaryButton
                    variant="outline"
                    leftBorder={false}
                    size="sm"
                    onClick={() => handleAddPlayerOutcome(slot)}
                    leftIcon={<Icons.Plus className="h-4 w-4" />}
                  />
                  {hasCopySources && (
                    <Select
                      className="text-sm w-44"
                      size="sm"
                      onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                        const [sourcePlayer, outcomeIndex] =
                          e.target.value.split(":");
                        if (!sourcePlayer || outcomeIndex === undefined) return;
                        handleCopyOutcome(
                          slot,
                          sourcePlayer as PlayerSlot,
                          parseInt(outcomeIndex)
                        );
                      }}
                      value=""
                    >
                      <option value="">Copy from...</option>
                      {copySources.flatMap(([otherSlot, otherOptions]) =>
                        (otherOptions?.outcomes || []).map((outcome, idx) => (
                          <option
                            key={`${otherSlot}-${idx}`}
                            value={`${otherSlot}:${idx}`}
                          >
                            Player {otherSlot.replace("player", "")}:{" "}
                            {outcome.question}
                          </option>
                        ))
                      )}
                    </Select>
                  )}
                </div>
              )}
            </div>

            {outcomesForPlayer.length === 0 && readOnly && (
              <div className="text-sm text-gray-500">No outcomes</div>
            )}

            {outcomesForPlayer.map((outcome, index) => (
              <OutcomeEditor
                key={outcome.id}
                outcome={outcome}
                index={index}
                editingOutcomes={editingOutcomes}
                setEditingOutcomes={setEditingOutcomes}
                onDelete={() => handleDeleteOutcome(slot, index)}
                onUpdate={(idx, updatedOutcome) => {
                  handleUpdateOutcome(slot, idx, updatedOutcome as Outcome);
                }}
                readOnly={readOnly}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
};

// Delegated section: render outcomes for a single player slot using provided handlers/state
interface PlayerOutcomesForPlayerProps {
  title?: string;
  playerSlot: PlayerSlot;
  playerOptions: Record<PlayerSlot, PlayerOptionsGeneration>;
  editingOutcomes: Set<string>;
  setEditingOutcomes: (callback: (prev: Set<string>) => Set<string>) => void;
  handleAddPlayerOutcome: (playerSlot: PlayerSlot) => void;
  handleCopyOutcome: (
    playerSlot: PlayerSlot,
    sourcePlayerSlot: PlayerSlot,
    outcomeIndex: number
  ) => void;
  handleUpdateOutcome: (
    playerSlot: PlayerSlot,
    index: number,
    updatedOutcome: Outcome
  ) => void;
  handleDeleteOutcome: (playerSlot: PlayerSlot, index: number) => void;
  readOnly?: boolean;
}

export const OutcomePlayer: React.FC<PlayerOutcomesForPlayerProps> = ({
  title = "Individual Outcomes",
  playerSlot,
  playerOptions,
  editingOutcomes,
  setEditingOutcomes,
  handleAddPlayerOutcome,
  handleCopyOutcome,
  handleUpdateOutcome,
  handleDeleteOutcome,
  readOnly = false,
}) => {
  const data = playerOptions[playerSlot] || { outcomes: [] };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold mb-1">{title}</h3>
        {!readOnly && (
          <div className="flex gap-2">
            <PrimaryButton
              onClick={() => handleAddPlayerOutcome(playerSlot)}
              variant="outline"
              leftBorder={false}
              size="sm"
              leftIcon={<Icons.Plus className="h-4 w-4" />}
            />
            {Object.entries(playerOptions).some(
              ([otherSlot, otherOptions]) =>
                otherSlot !== playerSlot &&
                (otherOptions?.outcomes || []).length > 0
            ) && (
              <Select
                className="text-sm w-44"
                size="sm"
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                  const [sourcePlayer, outcomeIndex] =
                    e.target.value.split(":");
                  if (!sourcePlayer || outcomeIndex === undefined) return;
                  handleCopyOutcome(
                    playerSlot,
                    sourcePlayer as PlayerSlot,
                    parseInt(outcomeIndex)
                  );
                }}
                value=""
              >
                <option value="">Copy from...</option>
                {Object.entries(playerOptions).flatMap(
                  ([otherSlot, otherOptions]) =>
                    otherSlot !== playerSlot
                      ? (otherOptions?.outcomes || []).map((outcome, idx) => (
                          <option
                            key={`${otherSlot}-${idx}`}
                            value={`${otherSlot}:${idx}`}
                          >
                            Player {otherSlot.replace("player", "")}:{" "}
                            {outcome.question}
                          </option>
                        ))
                      : []
                )}
              </Select>
            )}
          </div>
        )}
      </div>

      {data.outcomes.map((outcome, index) => (
        <OutcomeEditor
          key={outcome.id}
          outcome={outcome}
          index={index}
          editingOutcomes={editingOutcomes}
          setEditingOutcomes={setEditingOutcomes}
          onDelete={() => handleDeleteOutcome(playerSlot, index)}
          onUpdate={(idx, updatedOutcome) => {
            handleUpdateOutcome(playerSlot, idx, updatedOutcome as Outcome);
          }}
          readOnly={readOnly}
        />
      ))}
    </div>
  );
};
