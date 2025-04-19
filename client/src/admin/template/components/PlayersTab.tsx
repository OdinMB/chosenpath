import React from "react";
import {
  CharacterSelectionIntroduction,
  PlayerOptionsGeneration,
  PlayerSlot,
  Stat,
} from "@core/types";
import { MAX_PLAYERS } from "@core/config";
import { usePlayerEditor } from "../hooks/usePlayerEditor";
import { PlayerEditor, CharacterSelectionIntroEditor } from "./";

interface PlayersTabProps {
  playerOptions: Record<PlayerSlot, PlayerOptionsGeneration>;
  onChange: (updates: Record<PlayerSlot, PlayerOptionsGeneration>) => void;
  playerStats: Stat[];
  characterSelectionIntroduction: CharacterSelectionIntroduction;
  onCharacterSelectionIntroductionChange: (
    updatedIntro: CharacterSelectionIntroduction
  ) => void;
  readOnly?: boolean;
}

export const PlayersTab: React.FC<PlayersTabProps> = ({
  playerOptions,
  onChange,
  playerStats,
  characterSelectionIntroduction,
  onCharacterSelectionIntroductionChange,
  readOnly = false,
}) => {
  const {
    editingPlayers,
    editingIdentities,
    editingBackgrounds,
    editingOutcomes,
    setEditingPlayers,
    setEditingIdentities,
    setEditingBackgrounds,
    setEditingOutcomes,
    createEmptyIdentity,
    createEmptyBackground,
    handleAddPlayerOutcome,
    handleCopyOutcome,
    handleUpdateIdentity,
    handleDeleteIdentity,
    handleAddIdentity,
    handleUpdateBackground,
    handleDeleteBackground,
    handleAddBackground,
    handleUpdateOutcome,
    handleDeleteOutcome,
    handleSave,
  } = usePlayerEditor(playerOptions, onChange, playerStats, readOnly);

  return (
    <div className="space-y-8">
      <CharacterSelectionIntroEditor
        introduction={characterSelectionIntroduction}
        onChange={onCharacterSelectionIntroductionChange}
        readOnly={readOnly}
      />

      {Array.from({ length: MAX_PLAYERS }, (_, i) => {
        const playerSlot = `player${i + 1}` as PlayerSlot;
        return (
          <PlayerEditor
            key={playerSlot}
            playerSlot={playerSlot}
            options={
              playerOptions[playerSlot] || {
                outcomes: [],
                possibleCharacterIdentities: Array(3)
                  .fill(null)
                  .map(createEmptyIdentity),
                possibleCharacterBackgrounds: Array(3)
                  .fill(null)
                  .map(createEmptyBackground),
              }
            }
            playerOptions={playerOptions}
            playerStats={playerStats}
            editingPlayers={editingPlayers}
            editingIdentities={editingIdentities}
            editingBackgrounds={editingBackgrounds}
            editingOutcomes={editingOutcomes}
            setEditingPlayers={setEditingPlayers}
            setEditingIdentities={setEditingIdentities}
            setEditingBackgrounds={setEditingBackgrounds}
            setEditingOutcomes={setEditingOutcomes}
            handleAddIdentity={handleAddIdentity}
            handleUpdateIdentity={handleUpdateIdentity}
            handleDeleteIdentity={handleDeleteIdentity}
            handleAddBackground={handleAddBackground}
            handleUpdateBackground={handleUpdateBackground}
            handleDeleteBackground={handleDeleteBackground}
            handleAddPlayerOutcome={handleAddPlayerOutcome}
            handleCopyOutcome={handleCopyOutcome}
            handleUpdateOutcome={handleUpdateOutcome}
            handleDeleteOutcome={handleDeleteOutcome}
            handleSave={handleSave}
            readOnly={readOnly}
          />
        );
      })}
    </div>
  );
};
