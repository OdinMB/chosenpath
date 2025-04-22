import React from "react";
import {
  PlayerOptionsGeneration,
  PlayerSlot,
  Stat,
  CharacterIdentity,
  CharacterBackground,
  Outcome,
} from "core/types";
import { ExpandableItem } from "components";
import { PrimaryButton, Icons, Select } from "components/ui";
import {
  PlayerIdentityEditor,
  PlayerBackgroundEditor,
  OutcomeEditor,
} from "./";

// Pronoun sets available for character identities
const PRONOUN_SETS = [
  {
    label: "he/him",
    pronouns: {
      personal: "he",
      object: "him",
      possessive: "his",
      reflexive: "himself",
    },
  },
  {
    label: "she/her",
    pronouns: {
      personal: "she",
      object: "her",
      possessive: "her",
      reflexive: "herself",
    },
  },
  {
    label: "they/them",
    pronouns: {
      personal: "they",
      object: "them",
      possessive: "their",
      reflexive: "themselves",
    },
  },
  {
    label: "it/its",
    pronouns: {
      personal: "it",
      object: "it",
      possessive: "its",
      reflexive: "itself",
    },
  },
];

interface PlayerEditorProps {
  playerSlot: PlayerSlot;
  options: PlayerOptionsGeneration;
  playerOptions: Record<PlayerSlot, PlayerOptionsGeneration>;
  playerStats: Stat[];
  editingPlayers: Set<string>;
  editingIdentities: Set<string>;
  editingBackgrounds: Set<string>;
  editingOutcomes: Set<string>;
  setEditingPlayers: (callback: (prev: Set<string>) => Set<string>) => void;
  setEditingIdentities: (callback: (prev: Set<string>) => Set<string>) => void;
  setEditingBackgrounds: (callback: (prev: Set<string>) => Set<string>) => void;
  setEditingOutcomes: (callback: (prev: Set<string>) => Set<string>) => void;
  handleAddIdentity: (playerSlot: PlayerSlot) => void;
  handleUpdateIdentity: (
    playerSlot: PlayerSlot,
    index: number,
    updatedIdentity: CharacterIdentity
  ) => void;
  handleDeleteIdentity: (playerSlot: PlayerSlot, index: number) => void;
  handleAddBackground: (playerSlot: PlayerSlot) => void;
  handleUpdateBackground: (
    playerSlot: PlayerSlot,
    index: number,
    updatedBackground: CharacterBackground
  ) => void;
  handleDeleteBackground: (playerSlot: PlayerSlot, index: number) => void;
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
  handleSave: (playerSlot: PlayerSlot) => void;
  readOnly?: boolean;
}

export const PlayerEditor: React.FC<PlayerEditorProps> = ({
  playerSlot,
  options,
  playerOptions,
  playerStats,
  editingPlayers,
  editingIdentities,
  editingBackgrounds,
  editingOutcomes,
  setEditingPlayers,
  setEditingIdentities,
  setEditingBackgrounds,
  setEditingOutcomes,
  handleAddIdentity,
  handleUpdateIdentity,
  handleDeleteIdentity,
  handleAddBackground,
  handleUpdateBackground,
  handleDeleteBackground,
  handleAddPlayerOutcome,
  handleCopyOutcome,
  handleUpdateOutcome,
  handleDeleteOutcome,
  handleSave,
  readOnly = false,
}) => {
  // Render form for the ExpandableItem component
  const renderPlayerForm = (
    data: PlayerOptionsGeneration,
    onChange: (updatedData: PlayerOptionsGeneration) => void
  ) => {
    return (
      <div className="flex-1 space-y-12 mr-4">
        {/* Character Identities */}
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold mb-1">Character Identities</h3>
            {!readOnly && (
              <PrimaryButton
                variant="outline"
                leftBorder={false}
                size="sm"
                onClick={() => handleAddIdentity(playerSlot)}
                leftIcon={<Icons.Plus className="h-4 w-4" />}
              ></PrimaryButton>
            )}
          </div>
          {data.possibleCharacterIdentities.map((identity, index) => (
            <PlayerIdentityEditor
              key={`${playerSlot}_identity_${index}`}
              identity={identity}
              index={index}
              editingIdentities={editingIdentities}
              setEditingIdentities={setEditingIdentities}
              onDelete={() => handleDeleteIdentity(playerSlot, index)}
              onUpdate={(idx, updatedIdentity) => {
                handleUpdateIdentity(playerSlot, idx, updatedIdentity);
                // Update local data for immediate UI feedback
                const updated = [...data.possibleCharacterIdentities];
                updated[idx] = updatedIdentity;
                onChange({ ...data, possibleCharacterIdentities: updated });
              }}
              pronounSets={PRONOUN_SETS}
              readOnly={readOnly}
            />
          ))}
        </div>

        {/* Character Backgrounds */}
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold mb-1">Character Backgrounds</h3>
            {!readOnly && (
              <PrimaryButton
                variant="outline"
                leftBorder={false}
                size="sm"
                onClick={() => handleAddBackground(playerSlot)}
                leftIcon={<Icons.Plus className="h-4 w-4" />}
              ></PrimaryButton>
            )}
          </div>
          {data.possibleCharacterBackgrounds.map((background, index) => (
            <PlayerBackgroundEditor
              key={`${playerSlot}_background_${index}`}
              background={background}
              index={index}
              editingBackgrounds={editingBackgrounds}
              setEditingBackgrounds={setEditingBackgrounds}
              onDelete={() => handleDeleteBackground(playerSlot, index)}
              onUpdate={(idx, updatedBackground) => {
                handleUpdateBackground(playerSlot, idx, updatedBackground);
                // Update local data for immediate UI feedback
                const updated = [...data.possibleCharacterBackgrounds];
                updated[idx] = updatedBackground;
                onChange({ ...data, possibleCharacterBackgrounds: updated });
              }}
              playerStats={playerStats}
              readOnly={readOnly}
            />
          ))}
        </div>

        {/* Individual Outcomes */}
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold mb-1">Individual Outcomes</h3>
            {!readOnly && (
              <div className="flex gap-2">
                <PrimaryButton
                  onClick={() => handleAddPlayerOutcome(playerSlot)}
                  variant="outline"
                  leftBorder={false}
                  size="sm"
                  leftIcon={<Icons.Plus className="h-4 w-4" />}
                ></PrimaryButton>{" "}
                <Select
                  className="text-sm w-44"
                  size="sm"
                  onChange={(e) => {
                    const [sourcePlayer, outcomeIndex] =
                      e.target.value.split(":");
                    handleCopyOutcome(
                      playerSlot,
                      sourcePlayer as PlayerSlot,
                      parseInt(outcomeIndex)
                    );
                  }}
                  value=""
                >
                  <option value="">Copy from...</option>
                  {Object.entries(playerOptions).map(
                    ([otherSlot, otherOptions]) =>
                      otherSlot !== playerSlot &&
                      otherOptions.outcomes.map((outcome, idx) => (
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
                handleUpdateOutcome(playerSlot, idx, updatedOutcome);
                // Update local data for immediate UI feedback
                const updated = [...data.outcomes];
                updated[idx] = updatedOutcome;
                onChange({ ...data, outcomes: updated });
              }}
              readOnly={readOnly}
            />
          ))}
        </div>
      </div>
    );
  };

  return (
    <ExpandableItem
      id={playerSlot}
      title={`Player ${playerSlot.replace("player", "")}`}
      data={options}
      editingSet={editingPlayers}
      setEditing={setEditingPlayers}
      onDelete={() => {}} // No delete functionality for players
      onSave={() => handleSave(playerSlot)}
      renderEditForm={renderPlayerForm}
      readOnly={readOnly}
    />
  );
};
