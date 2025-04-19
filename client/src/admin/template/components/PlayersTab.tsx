import React, { useState } from "react";
import {
  CharacterSelectionIntroduction,
  PlayerOptionsGeneration,
  PlayerSlot,
  Stat,
} from "@core/types";
import { MAX_PLAYERS } from "@core/config";
import {
  OutcomeEditor,
  PlayerIdentityEditor,
  PlayerBackgroundEditor,
} from "./";
import { PrimaryButton, Icons, Select } from "@components/ui";
import { usePlayerEditor } from "../hooks/usePlayerEditor";

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

interface CharacterSelectionIntroductionCardProps {
  introduction: CharacterSelectionIntroduction;
  onChange: (updatedIntro: CharacterSelectionIntroduction) => void;
  readOnly?: boolean;
}

const CharacterSelectionIntroductionCard: React.FC<
  CharacterSelectionIntroductionCardProps
> = ({ introduction, onChange, readOnly = false }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [localIntroduction, setLocalIntroduction] = useState(introduction);

  const handleSave = () => {
    onChange(localIntroduction);
    setIsEditing(false);
  };

  const handleChange = (
    field: keyof CharacterSelectionIntroduction,
    value: string
  ) => {
    setLocalIntroduction((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  if (!isEditing) {
    return (
      <div className="bg-white p-4 rounded-lg shadow mb-4">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-lg font-semibold">
            Character Selection Introduction
          </h3>
          {!readOnly && (
            <button
              onClick={() => setIsEditing(true)}
              className="text-secondary hover:text-secondary-700"
              aria-label="Edit character selection introduction"
            >
              <Icons.Edit className="h-5 w-5" />
            </button>
          )}
        </div>
        <div className="space-y-2">
          <div>
            <span className="font-medium">Title:</span>{" "}
            <span>{introduction.title || "No title set"}</span>
          </div>
          <div>
            <span className="font-medium">Introduction Text:</span>
            <p className="mt-1 text-sm text-gray-600">
              {introduction.text || "No introduction text set"}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white p-4 rounded-lg shadow mb-4">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">
          Character Selection Introduction
        </h3>
      </div>
      <div className="space-y-4">
        <div>
          <label
            htmlFor="intro-title"
            className="block text-sm font-medium text-gray-700"
          >
            Title
          </label>
          <input
            id="intro-title"
            type="text"
            value={localIntroduction.title || ""}
            onChange={(e) => handleChange("title", e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            placeholder="Enter a title for the character selection screen"
          />
        </div>
        <div>
          <label
            htmlFor="intro-text"
            className="block text-sm font-medium text-gray-700"
          >
            Introduction Text
          </label>
          <textarea
            id="intro-text"
            value={localIntroduction.text || ""}
            onChange={(e) => handleChange("text", e.target.value)}
            rows={5}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            placeholder="Enter introduction text for the character selection screen"
          />
          <p className="mt-1 text-xs text-gray-500">
            Write a short introduction to the setting, followed by a question
            about the player's identity and background.
          </p>
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <PrimaryButton
          onClick={() => setIsEditing(false)}
          variant="outline"
          leftBorder={false}
        >
          Cancel
        </PrimaryButton>
        <PrimaryButton onClick={handleSave} variant="secondary">
          Save
        </PrimaryButton>
      </div>
    </div>
  );
};

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

  const PlayerEditor = ({
    playerSlot,
    options,
  }: {
    playerSlot: PlayerSlot;
    options: PlayerOptionsGeneration;
  }) => {
    const isEditing = editingPlayers.has(playerSlot);

    const handleExpandCollapse = () => {
      if (readOnly) {
        setEditingPlayers((prev) => {
          const next = new Set(prev);
          if (next.has(playerSlot)) {
            next.delete(playerSlot);
          } else {
            next.add(playerSlot);
          }
          return next;
        });
      }
    };

    if (!isEditing) {
      return (
        <div className="bg-white p-4 rounded-lg shadow mb-4">
          <div className="flex justify-between items-center">
            <div>
              <span className="font-medium">
                Player {playerSlot.replace("player", "")}
              </span>
            </div>
            {readOnly ? (
              <button
                onClick={handleExpandCollapse}
                className="text-gray-500 hover:text-gray-700"
                aria-label={`Expand Player ${playerSlot.replace("player", "")}`}
              >
                <Icons.ChevronDown className="h-5 w-5" />
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() =>
                    setEditingPlayers((prev) => new Set(prev).add(playerSlot))
                  }
                  className="text-secondary hover:text-secondary-700"
                  aria-label={`Edit ${playerSlot}`}
                >
                  <Icons.Edit className="h-5 w-5" />
                </button>
              </div>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="bg-white p-4 rounded-lg shadow mb-4">
        <div className="flex-1 space-y-12 mr-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">
              Player {playerSlot.replace("player", "")}
            </h3>
            {readOnly && (
              <button
                onClick={handleExpandCollapse}
                className="text-gray-500 hover:text-gray-700"
                aria-label={`Collapse Player ${playerSlot.replace(
                  "player",
                  ""
                )}`}
              >
                <Icons.ChevronUp className="h-5 w-5" />
              </button>
            )}
          </div>

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
            {options.possibleCharacterIdentities.map((identity, index) => (
              <PlayerIdentityEditor
                key={`${playerSlot}_identity_${index}`}
                identity={identity}
                index={index}
                editingIdentities={editingIdentities}
                setEditingIdentities={setEditingIdentities}
                onDelete={() => handleDeleteIdentity(playerSlot, index)}
                onUpdate={(idx, updatedIdentity) =>
                  handleUpdateIdentity(playerSlot, idx, updatedIdentity)
                }
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
            {options.possibleCharacterBackgrounds.map((background, index) => (
              <PlayerBackgroundEditor
                key={`${playerSlot}_background_${index}`}
                background={background}
                index={index}
                editingBackgrounds={editingBackgrounds}
                setEditingBackgrounds={setEditingBackgrounds}
                onDelete={() => handleDeleteBackground(playerSlot, index)}
                onUpdate={(idx, updatedBackground) =>
                  handleUpdateBackground(playerSlot, idx, updatedBackground)
                }
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

            {options.outcomes.map((outcome, index) => (
              <OutcomeEditor
                key={outcome.id}
                outcome={outcome}
                index={index}
                editingOutcomes={editingOutcomes}
                setEditingOutcomes={setEditingOutcomes}
                onDelete={() => handleDeleteOutcome(playerSlot, index)}
                onUpdate={(idx, updatedOutcome) =>
                  handleUpdateOutcome(playerSlot, idx, updatedOutcome)
                }
                readOnly={readOnly}
              />
            ))}
          </div>
        </div>
        {readOnly ? (
          <div className="flex justify-end gap-2 mt-4">
            <PrimaryButton
              onClick={handleExpandCollapse}
              variant="outline"
              leftBorder={false}
            >
              Back
            </PrimaryButton>
          </div>
        ) : (
          <div className="flex justify-end gap-2 mt-4">
            <PrimaryButton
              onClick={() => handleSave(playerSlot)}
              variant="outline"
            >
              Save
            </PrimaryButton>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-8">
      <CharacterSelectionIntroductionCard
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
          />
        );
      })}
    </div>
  );
};
