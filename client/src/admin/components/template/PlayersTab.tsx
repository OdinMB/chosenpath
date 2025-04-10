import React, { useState } from "react";
import { PrimaryButton } from "@components/ui/PrimaryButton";
import { Icons } from "@components/ui/Icons";
import { PlayerOptionsGeneration } from "@core/types/story";
import { CharacterIdentity, CharacterBackground } from "@core/types/player";
import { MAX_PLAYERS } from "@core/config";
import { PlayerSlot } from "@core/types/player";
import { Stat } from "@core/types/stat";
import { ExpandableOutcome } from "./ExpandableOutcome";
import { PlayerIdentity } from "./PlayerIdentity";
import { PlayerBackground } from "./PlayerBackground";

interface PlayerOutcome {
  id: string;
  question: string;
  resonance: string;
  possibleResolutions:
    | { favorable: string; unfavorable: string; mixed: string }
    | { resolution1: string; resolution2: string; resolution3: string }
    | { mixed: string; sideAWins: string; sideBWins: string };
  intendedNumberOfMilestones: number;
  milestones: string[];
}

interface PlayersTabProps {
  playerOptions: Record<PlayerSlot, PlayerOptionsGeneration>;
  onChange: (updates: Record<PlayerSlot, PlayerOptionsGeneration>) => void;
  playerStats: Stat[];
}

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
}) => {
  // Track which players are being edited
  const [editingPlayers, setEditingPlayers] = useState<Set<string>>(new Set());
  // Track which identities are being edited
  const [editingIdentities, setEditingIdentities] = useState<Set<string>>(
    new Set()
  );
  // Track which backgrounds are being edited
  const [editingBackgrounds, setEditingBackgrounds] = useState<Set<string>>(
    new Set()
  );
  // Track which outcomes are being edited
  const [editingOutcomes, setEditingOutcomes] = useState<Set<string>>(
    new Set()
  );

  const handleUpdatePlayer = (
    playerSlot: PlayerSlot,
    updates: Partial<PlayerOptionsGeneration>
  ) => {
    onChange({
      ...playerOptions,
      [playerSlot]: {
        ...playerOptions[playerSlot],
        ...updates,
      },
    });
  };

  const createEmptyIdentity = (): CharacterIdentity => ({
    name: "",
    appearance: "",
    pronouns: {
      personal: "",
      object: "",
      possessive: "",
      reflexive: "",
    },
  });

  const createEmptyBackground = (): CharacterBackground => {
    const initialPlayerStatValues = playerStats.map((stat) => {
      let initialValue: number | string | string[];

      switch (stat.type) {
        case "string":
          initialValue = "";
          break;
        case "string[]":
          initialValue = [];
          break;
        case "number":
        case "percentage":
        case "opposites":
        default:
          initialValue = 50;
      }

      return {
        statId: stat.id,
        value: initialValue,
      };
    });

    return {
      title: "",
      fluffTemplate: "",
      initialPlayerStatValues,
    };
  };

  const handleAddPlayerOutcome = (playerSlot: PlayerSlot) => {
    const outcomeId = crypto.randomUUID();
    const newOutcome: PlayerOutcome = {
      id: outcomeId,
      question: "",
      resonance: "",
      possibleResolutions: {
        favorable: "",
        unfavorable: "",
        mixed: "",
      },
      intendedNumberOfMilestones: 3,
      milestones: [],
    };

    // Start in edit mode for the new outcome
    const outcomeStateKey = `${playerSlot}_outcome_${outcomeId}`;
    setEditingOutcomes((prev) => new Set(prev).add(outcomeStateKey));

    handleUpdatePlayer(playerSlot, {
      outcomes: [...(playerOptions[playerSlot].outcomes || []), newOutcome],
    });
  };

  const PlayerEditor = ({
    playerSlot,
    options,
  }: {
    playerSlot: PlayerSlot;
    options: PlayerOptionsGeneration;
  }) => {
    const isEditing = editingPlayers.has(playerSlot);
    const [localOptions, setLocalOptions] = useState<PlayerOptionsGeneration>(
      () => ({
        ...options,
        possibleCharacterIdentities: options.possibleCharacterIdentities.length
          ? options.possibleCharacterIdentities
          : Array(3).fill(null).map(createEmptyIdentity),
        possibleCharacterBackgrounds: options.possibleCharacterBackgrounds
          .length
          ? options.possibleCharacterBackgrounds
          : Array(3).fill(null).map(createEmptyBackground),
        outcomes: options.outcomes || [],
      })
    );

    const handleCopyOutcome = (
      sourcePlayerSlot: PlayerSlot,
      outcomeIndex: number
    ) => {
      const sourceOutcome =
        playerOptions[sourcePlayerSlot]?.outcomes[outcomeIndex];
      if (sourceOutcome) {
        const copiedOutcome: PlayerOutcome = {
          ...sourceOutcome,
          id: crypto.randomUUID(),
        };
        setLocalOptions((prev) => ({
          ...prev,
          outcomes: [...prev.outcomes, copiedOutcome],
        }));
      }
    };

    const handleUpdateIdentity = (
      index: number,
      updatedIdentity: CharacterIdentity
    ) => {
      const updated = [...localOptions.possibleCharacterIdentities];
      updated[index] = updatedIdentity;
      setLocalOptions((prev) => ({
        ...prev,
        possibleCharacterIdentities: updated,
      }));
    };

    const handleDeleteIdentity = (index: number) => {
      const updated = [...localOptions.possibleCharacterIdentities];
      updated.splice(index, 1);
      setLocalOptions((prev) => ({
        ...prev,
        possibleCharacterIdentities: updated,
      }));
    };

    const handleAddIdentity = () => {
      setLocalOptions((prev) => ({
        ...prev,
        possibleCharacterIdentities: [
          ...prev.possibleCharacterIdentities,
          createEmptyIdentity(),
        ],
      }));
    };

    const handleUpdateBackground = (
      index: number,
      updatedBackground: CharacterBackground
    ) => {
      const updated = [...localOptions.possibleCharacterBackgrounds];
      updated[index] = updatedBackground;
      setLocalOptions((prev) => ({
        ...prev,
        possibleCharacterBackgrounds: updated,
      }));
    };

    const handleDeleteBackground = (index: number) => {
      const updated = [...localOptions.possibleCharacterBackgrounds];
      updated.splice(index, 1);
      setLocalOptions((prev) => ({
        ...prev,
        possibleCharacterBackgrounds: updated,
      }));
    };

    const handleAddBackground = () => {
      setLocalOptions((prev) => ({
        ...prev,
        possibleCharacterBackgrounds: [
          ...prev.possibleCharacterBackgrounds,
          createEmptyBackground(),
        ],
      }));
    };

    const handleUpdateOutcome = (
      index: number,
      updatedOutcome: PlayerOutcome
    ) => {
      const updated = [...localOptions.outcomes];
      updated[index] = updatedOutcome;
      setLocalOptions((prev) => ({
        ...prev,
        outcomes: updated,
      }));
    };

    const handleDeleteOutcome = (index: number) => {
      const updated = [...localOptions.outcomes];
      updated.splice(index, 1);
      setLocalOptions((prev) => ({
        ...prev,
        outcomes: updated,
      }));
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

    const handleSave = () => {
      handleUpdatePlayer(playerSlot, localOptions);
      setEditingPlayers((prev) => {
        const next = new Set(prev);
        next.delete(playerSlot);
        return next;
      });
    };

    return (
      <div className="bg-white p-4 rounded-lg shadow mb-4">
        <div className="flex-1 space-y-6 mr-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">
              Player {playerSlot.replace("player", "")}
            </h3>
          </div>

          {/* Character Identities */}
          <div className="space-y-4">
            <h3 className="font-semibold mb-1">Character Identities</h3>
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
            <div className="flex justify-end">
              <PrimaryButton
                variant="outline"
                size="sm"
                onClick={handleAddIdentity}
                leftIcon={<Icons.Plus className="h-4 w-4" />}
              >
                Add Identity
              </PrimaryButton>
            </div>
          </div>

          {/* Character Backgrounds */}
          <div className="space-y-4">
            <h3 className="font-semibold mb-1">Character Backgrounds</h3>
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
            <div className="flex justify-end">
              <PrimaryButton
                variant="outline"
                size="sm"
                onClick={handleAddBackground}
                leftIcon={<Icons.Plus className="h-4 w-4" />}
              >
                Add Background
              </PrimaryButton>
            </div>
          </div>

          {/* Individual Outcomes */}
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold mb-1">Individual Outcomes</h3>
              <div className="flex gap-2">
                <select
                  className="px-2 py-1 border rounded text-sm"
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
                </select>
                <PrimaryButton
                  onClick={() => handleAddPlayerOutcome(playerSlot)}
                  variant="outline"
                  size="sm"
                  leftIcon={<Icons.Plus className="h-4 w-4" />}
                >
                  Add Outcome
                </PrimaryButton>
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
