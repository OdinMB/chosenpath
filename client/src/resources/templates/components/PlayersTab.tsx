import React from "react";
import {
  CharacterSelectionIntroduction,
  PlayerOptionsGeneration,
  PlayerSlot,
  Stat,
  ImageInstructions,
} from "core/types";
import { MAX_PLAYERS } from "core/config";
import { usePlayerEditor } from "../hooks/usePlayerEditor";
import { PlayerEditor, CharacterSelectionIntroEditor } from ".";
import { AcademyContextCard } from "./AcademyContextCard";
import { AiIterationCard } from "./AiIterationCard";
import { AiIterationSuggestDraft } from "./AiIterationSuggestDraft";

interface PlayersTabProps {
  playerOptions: Record<PlayerSlot, PlayerOptionsGeneration>;
  onChange: (updates: Record<PlayerSlot, PlayerOptionsGeneration>) => void;
  playerStats: Stat[];
  onCharacterSelectionIntroductionChange: (
    updatedIntro: CharacterSelectionIntroduction
  ) => void;
  characterSelectionIntroduction?: CharacterSelectionIntroduction;
  readOnly?: boolean;
  templateId: string;
  imageInstructions?: ImageInstructions;
  canGenerateImages?: boolean;
  showContextCards?: boolean;
  isAiIterating?: boolean;
  isSparse?: boolean;
  onRequestPlayersIteration?: (
    feedback: string,
    sections: string[]
  ) => Promise<void> | void;
}

export const PlayersTab: React.FC<PlayersTabProps> = ({
  playerOptions,
  onChange,
  playerStats,
  characterSelectionIntroduction,
  onCharacterSelectionIntroductionChange,
  readOnly = false,
  templateId,
  imageInstructions,
  canGenerateImages = true,
  showContextCards = true,
  isAiIterating,
  isSparse = false,
  onRequestPlayersIteration,
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
      {showContextCards && !readOnly && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <AcademyContextCard
            lectureHref="/academy/setting"
            blurb="Define possible player characters with Identities, Backgrounds, and personal Outcomes."
            blurbShort="Define player characters with Identities, Backgrounds, and Outcomes."
          />
          {isSparse ? (
            <AiIterationSuggestDraft
              onGoToDraft={() =>
                window.dispatchEvent(
                  new CustomEvent("cp:set-active-tab", {
                    detail: { tab: "ai-draft" },
                  })
                )
              }
            />
          ) : (
            <AiIterationCard
              onRequestIteration={async (feedback, sections) => {
                if (onRequestPlayersIteration) {
                  await onRequestPlayersIteration(
                    feedback,
                    sections as string[]
                  );
                }
              }}
              templateId={templateId}
              isLoading={Boolean(isAiIterating)}
              placeholder="Instructions"
              placeholderShort="Instructions"
              selectedSections={["stats", "sharedOutcomes", "players"]}
              buttonText="Improve Player Setup"
            />
          )}
        </div>
      )}
      {characterSelectionIntroduction ? (
        <CharacterSelectionIntroEditor
          introduction={characterSelectionIntroduction}
          onChange={onCharacterSelectionIntroductionChange}
          readOnly={readOnly}
        />
      ) : (
        <div className="bg-white p-4 rounded-lg shadow mb-4">
          <h3 className="text-lg font-semibold">
            Character Selection Introduction
          </h3>
          <p>No character selection introduction found</p>
        </div>
      )}

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
            templateId={templateId}
            imageInstructions={imageInstructions}
            canGenerateImages={canGenerateImages}
          />
        );
      })}
    </div>
  );
};
