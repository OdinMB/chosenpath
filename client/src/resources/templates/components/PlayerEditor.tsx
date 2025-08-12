import React from "react";
import {
  PlayerOptionsGeneration,
  PlayerSlot,
  Stat,
  CharacterIdentity,
  CharacterBackground,
  Outcome,
  ImageInstructions,
} from "core/types";
import { ExpandableItem } from "components";
import { PrimaryButton, Icons } from "components/ui";
import { PlayerIdentityEditor, PlayerBackgroundEditor } from "./";
import { OutcomePlayer } from "./PlayerOutcomes";

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
  templateId: string;
  imageInstructions?: ImageInstructions;
  canGenerateImages?: boolean;
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
  templateId,
  imageInstructions,
  canGenerateImages = true,
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
              playerSlot={playerSlot}
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
              templateId={templateId}
              imageInstructions={imageInstructions}
              canGenerateImages={canGenerateImages}
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
        <OutcomePlayer
          title="Individual Outcomes"
          playerSlot={playerSlot}
          playerOptions={playerOptions}
          editingOutcomes={editingOutcomes}
          setEditingOutcomes={setEditingOutcomes}
          handleAddPlayerOutcome={handleAddPlayerOutcome}
          handleCopyOutcome={handleCopyOutcome}
          handleUpdateOutcome={handleUpdateOutcome}
          handleDeleteOutcome={handleDeleteOutcome}
          readOnly={readOnly}
        />
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
      description={(() => {
        const identityNames = (options.possibleCharacterIdentities || [])
          .map((identity) => identity?.name?.trim())
          .filter((name): name is string => Boolean(name));
        const backgroundTitles = (options.possibleCharacterBackgrounds || [])
          .map((background) => background?.title?.trim())
          .filter((title): title is string => Boolean(title));
        const outcomeQuestions = (options.outcomes || [])
          .map((outcome) => outcome?.question?.trim())
          .filter((q): q is string => Boolean(q));

        if (
          identityNames.length === 0 &&
          backgroundTitles.length === 0 &&
          outcomeQuestions.length === 0
        ) {
          return undefined;
        }

        return (
          <>
            {identityNames.length > 0 && <div>{identityNames.join(" / ")}</div>}
            {backgroundTitles.length > 0 && (
              <div>{backgroundTitles.join(" / ")}</div>
            )}
            {outcomeQuestions.length > 0 && (
              <div className="mt-1">
                {outcomeQuestions.map((q, idx) => (
                  <div key={`outcome-${idx}`}>{q}</div>
                ))}
              </div>
            )}
          </>
        );
      })()}
      readOnly={readOnly}
    />
  );
};
