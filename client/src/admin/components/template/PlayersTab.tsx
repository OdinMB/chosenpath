import React, { useState } from "react";
import { PrimaryButton } from "@components/ui/PrimaryButton";
import { Icons } from "@components/ui/Icons";
import { Input } from "@components/ui/Input";
import { Select } from "../../../shared/components/ui/Select";
import { PlayerOptionsGeneration } from "@core/types/story";
import { CharacterIdentity, CharacterBackground } from "@core/types/player";
import { MAX_PLAYERS } from "@core/config";
import { PlayerSlot } from "@core/types/player";
import { StatValueInput } from "./StatValueInput";
import { Stat } from "@core/types/stat";

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
  playerCount: number;
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
    const newOutcome: PlayerOutcome = {
      id: crypto.randomUUID(),
      question: "",
      resonance: "",
      possibleResolutions: {
        mixed: "",
        sideAWins: "",
        sideBWins: "",
      },
      intendedNumberOfMilestones: 3,
      milestones: [],
    };

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
              <div key={index} className="space-y-2">
                <div className="flex flex-col gap-2">
                  <h4 className="text-sm font-medium">Identity {index + 1}</h4>
                  <div className="flex gap-2">
                    <Input
                      value={identity.name}
                      onChange={(e) => {
                        const updated = [
                          ...localOptions.possibleCharacterIdentities,
                        ];
                        updated[index] = {
                          ...updated[index],
                          name: e.target.value,
                        };
                        setLocalOptions((prev) => ({
                          ...prev,
                          possibleCharacterIdentities: updated,
                        }));
                      }}
                      placeholder="Character name"
                      className="flex-1"
                    />
                    <Select
                      size="sm"
                      className="w-36"
                      value={PRONOUN_SETS.findIndex(
                        (set) =>
                          set.pronouns.personal ===
                            identity.pronouns.personal &&
                          set.pronouns.object === identity.pronouns.object &&
                          set.pronouns.possessive ===
                            identity.pronouns.possessive &&
                          set.pronouns.reflexive === identity.pronouns.reflexive
                      )}
                      onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                        const updated = [
                          ...localOptions.possibleCharacterIdentities,
                        ];
                        updated[index] = {
                          ...updated[index],
                          pronouns:
                            PRONOUN_SETS[Number(e.target.value)].pronouns,
                        };
                        setLocalOptions((prev) => ({
                          ...prev,
                          possibleCharacterIdentities: updated,
                        }));
                      }}
                    >
                      <option value={-1}>Select pronouns...</option>
                      {PRONOUN_SETS.map((set, i) => (
                        <option key={i} value={i}>
                          {set.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <Input
                    value={identity.appearance}
                    onChange={(e) => {
                      const updated = [
                        ...localOptions.possibleCharacterIdentities,
                      ];
                      updated[index] = {
                        ...updated[index],
                        appearance: e.target.value,
                      };
                      setLocalOptions((prev) => ({
                        ...prev,
                        possibleCharacterIdentities: updated,
                      }));
                    }}
                    placeholder="Character appearance"
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Character Backgrounds */}
          <div className="space-y-4">
            <h3 className="font-semibold mb-1">Character Backgrounds</h3>
            {localOptions.possibleCharacterBackgrounds.map(
              (background, index) => (
                <div key={index} className="space-y-2">
                  <div className="flex flex-col gap-2">
                    <h4 className="text-sm font-medium">
                      Background {index + 1}
                    </h4>
                    <Input
                      value={background.title}
                      onChange={(e) => {
                        const updated = [
                          ...localOptions.possibleCharacterBackgrounds,
                        ];
                        updated[index] = {
                          ...updated[index],
                          title: e.target.value,
                        };
                        setLocalOptions((prev) => ({
                          ...prev,
                          possibleCharacterBackgrounds: updated,
                        }));
                      }}
                      placeholder="Background title"
                    />
                    <textarea
                      className="w-full p-2 border rounded"
                      rows={3}
                      value={background.fluffTemplate}
                      onChange={(e) => {
                        const updated = [
                          ...localOptions.possibleCharacterBackgrounds,
                        ];
                        updated[index] = {
                          ...updated[index],
                          fluffTemplate: e.target.value,
                        };
                        setLocalOptions((prev) => ({
                          ...prev,
                          possibleCharacterBackgrounds: updated,
                        }));
                      }}
                      placeholder="Background description with placeholders: {name}, {personal}, {object}, {possessive}, {reflexive}"
                    />
                    <div className="space-y-2">
                      <h5 className="text-sm font-medium">
                        Initial Stat Values
                      </h5>
                      {background.initialPlayerStatValues.map(
                        (statValue, statIndex) => {
                          const stat = playerStats.find(
                            (s) => s.id === statValue.statId
                          );
                          if (!stat) return null;
                          return (
                            <div
                              key={statValue.statId}
                              className="flex gap-2 items-center"
                            >
                              <span className="text-sm w-32 font-medium">
                                {stat.name}
                              </span>
                              <StatValueInput
                                value={statValue.value}
                                onChange={(newValue) => {
                                  const updated = [
                                    ...localOptions.possibleCharacterBackgrounds,
                                  ];
                                  updated[index] = {
                                    ...updated[index],
                                    initialPlayerStatValues: updated[
                                      index
                                    ].initialPlayerStatValues.map((v, i) =>
                                      i === statIndex
                                        ? {
                                            ...v,
                                            value: newValue,
                                          }
                                        : v
                                    ),
                                  };
                                  setLocalOptions((prev) => ({
                                    ...prev,
                                    possibleCharacterBackgrounds: updated,
                                  }));
                                }}
                                statType={stat.type}
                                placeholder={`Initial ${stat.name}`}
                                className="flex-1"
                              />
                            </div>
                          );
                        }
                      )}
                    </div>
                  </div>
                </div>
              )
            )}
          </div>

          {/* Individual Outcomes */}
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold mb-1">Individual Outcomes</h3>
              <div className="flex gap-2">
                <Select
                  size="sm"
                  variant="outline"
                  className="w-48"
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
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
                <PrimaryButton
                  onClick={() => handleAddPlayerOutcome(playerSlot)}
                  variant="outline"
                  size="sm"
                >
                  Add Outcome
                </PrimaryButton>
              </div>
            </div>
            {localOptions.outcomes.map((outcome, index) => (
              <div key={outcome.id} className="space-y-2">
                <div className="flex flex-col gap-2">
                  <h4 className="text-sm font-medium">Outcome {index + 1}</h4>
                  <Input
                    value={outcome.question}
                    onChange={(e) => {
                      const updated = [...localOptions.outcomes];
                      updated[index] = {
                        ...updated[index],
                        question: e.target.value,
                      };
                      setLocalOptions((prev) => ({
                        ...prev,
                        outcomes: updated,
                      }));
                    }}
                    placeholder="Question that defines the outcome"
                  />
                  <textarea
                    className="w-full p-2 border rounded"
                    rows={2}
                    value={outcome.resonance}
                    onChange={(e) => {
                      const updated = [...localOptions.outcomes];
                      updated[index] = {
                        ...updated[index],
                        resonance: e.target.value,
                      };
                      setLocalOptions((prev) => ({
                        ...prev,
                        outcomes: updated,
                      }));
                    }}
                    placeholder="Why does this matter to the character?"
                  />
                  <button
                    onClick={() => {
                      setLocalOptions((prev) => ({
                        ...prev,
                        outcomes: prev.outcomes.filter((_, i) => i !== index),
                      }));
                    }}
                    className="text-red-600 hover:text-red-800 text-sm"
                  >
                    Remove Outcome
                  </button>
                </div>
              </div>
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
