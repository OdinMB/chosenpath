import React, { useState } from "react";
import {
  CharacterSelectionIntroduction,
  PlayerOptionsGeneration,
  PlayerSlot,
  Stat,
} from "@core/types";
import { MAX_PLAYERS } from "@core/config";
import { ExpandableOutcome, PlayerIdentity, PlayerBackground } from "./";
import { PrimaryButton, Icons, Select } from "@components/ui";
import { usePlayers } from "../hooks/usePlayers";
import { usePlayerEditor } from "../hooks/usePlayerEditor";

interface PlayersTabProps {
  playerOptions: Record<PlayerSlot, PlayerOptionsGeneration>;
  onChange: (updates: Record<PlayerSlot, PlayerOptionsGeneration>) => void;
  playerStats: Stat[];
  characterSelectionIntroduction: CharacterSelectionIntroduction;
  onCharacterSelectionIntroductionChange: (
    updatedIntro: CharacterSelectionIntroduction
  ) => void;
}

interface CharacterSelectionIntroductionCardProps {
  introduction: CharacterSelectionIntroduction;
  onChange: (updatedIntro: CharacterSelectionIntroduction) => void;
}

const CharacterSelectionIntroductionCard: React.FC<
  CharacterSelectionIntroductionCardProps
> = ({ introduction, onChange }) => {
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
          <button
            onClick={() => setIsEditing(true)}
            className="text-secondary hover:text-secondary-700"
            aria-label="Edit character selection introduction"
          >
            <Icons.Edit className="h-5 w-5" />
          </button>
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
    handleUpdatePlayer,
    createEmptyIdentity,
    createEmptyBackground,
    handleAddPlayerOutcome,
  } = usePlayers(playerOptions, onChange, playerStats);

  const PlayerEditor = ({
    playerSlot,
    options,
  }: {
    playerSlot: PlayerSlot;
    options: PlayerOptionsGeneration;
  }) => {
    const isEditing = editingPlayers.has(playerSlot);

    const {
      localOptions,
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
    } = usePlayerEditor(
      playerSlot,
      options,
      playerOptions,
      handleUpdatePlayer,
      createEmptyIdentity,
      createEmptyBackground,
      setEditingPlayers
    );

    if (!isEditing) {
      return (
        <div className="bg-white p-4 rounded-lg shadow mb-4">
          <div className="flex justify-between items-center">
            <div>
              <span className="font-medium">
                Player {playerSlot.replace("player", "")}
              </span>
            </div>
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
          </div>

          {/* Character Identities */}
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold mb-1">Character Identities</h3>
              <PrimaryButton
                variant="outline"
                leftBorder={false}
                size="sm"
                onClick={handleAddIdentity}
                leftIcon={<Icons.Plus className="h-4 w-4" />}
              ></PrimaryButton>
            </div>
            {localOptions.possibleCharacterIdentities.map((identity, index) => (
              <PlayerIdentity
                key={`${playerSlot}_identity_${index}`}
                identity={identity}
                index={index}
                editingIdentities={editingIdentities}
                setEditingIdentities={setEditingIdentities}
                onDelete={handleDeleteIdentity}
                onUpdate={handleUpdateIdentity}
                pronounSets={PRONOUN_SETS}
              />
            ))}
          </div>

          {/* Character Backgrounds */}
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold mb-1">Character Backgrounds</h3>
              <PrimaryButton
                variant="outline"
                leftBorder={false}
                size="sm"
                onClick={handleAddBackground}
                leftIcon={<Icons.Plus className="h-4 w-4" />}
              ></PrimaryButton>
            </div>
            {localOptions.possibleCharacterBackgrounds.map(
              (background, index) => (
                <PlayerBackground
                  key={`${playerSlot}_background_${index}`}
                  background={background}
                  index={index}
                  editingBackgrounds={editingBackgrounds}
                  setEditingBackgrounds={setEditingBackgrounds}
                  onDelete={handleDeleteBackground}
                  onUpdate={handleUpdateBackground}
                  playerStats={playerStats}
                />
              )
            )}
          </div>

          {/* Individual Outcomes */}
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold mb-1">Individual Outcomes</h3>
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
            </div>

            {localOptions.outcomes.map((outcome, index) => (
              <ExpandableOutcome
                key={outcome.id}
                outcome={outcome}
                index={index}
                editingOutcomes={editingOutcomes}
                setEditingOutcomes={setEditingOutcomes}
                onDelete={handleDeleteOutcome}
                onUpdate={handleUpdateOutcome}
              />
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <PrimaryButton onClick={handleSave} variant="outline">
            Save
          </PrimaryButton>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8">
      <CharacterSelectionIntroductionCard
        introduction={characterSelectionIntroduction}
        onChange={onCharacterSelectionIntroductionChange}
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
