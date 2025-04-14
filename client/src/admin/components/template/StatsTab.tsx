import { useState, useEffect } from "react";
import {
  Stat,
  StatValueEntry,
  PlayerSlot,
  PlayerOptionsGeneration,
} from "@core/types";
import { InfoIcon, PrimaryButton, Icons, Input } from "@components/ui";
import { StatValueInput } from "./StatValueInput";

type StatsTabProps = {
  statGroups: string[];
  sharedStats: Stat[];
  playerStats: Stat[];
  initialSharedStatValues: StatValueEntry[];
  playerOptions: Record<PlayerSlot, PlayerOptionsGeneration>;
  onChange: (updates: {
    statGroups?: string[];
    sharedStats?: Stat[];
    playerStats?: Stat[];
    initialSharedStatValues?: StatValueEntry[];
    playerOptions?: Record<PlayerSlot, PlayerOptionsGeneration>;
  }) => void;
};

export const StatsTab = ({
  statGroups,
  sharedStats,
  playerStats,
  initialSharedStatValues,
  playerOptions,
  onChange,
}: StatsTabProps) => {
  // Track which stats are being edited by their IDs
  const [editingStats, setEditingStats] = useState<Set<string>>(new Set());

  const handleRemoveGroup = (index: number) => {
    const updated = statGroups.filter((_, i) => i !== index);
    onChange({ statGroups: updated });
  };

  // Helper function to update player stat references when an ID changes
  const updatePlayerStatReferences = (oldId: string, newId: string) => {
    const updatedPlayerOptions = { ...playerOptions };
    let hasChanges = false;

    // Update all character backgrounds for all players
    Object.keys(updatedPlayerOptions).forEach((playerSlot) => {
      const player = updatedPlayerOptions[playerSlot as PlayerSlot];

      player.possibleCharacterBackgrounds.forEach((background) => {
        const statValueIndex = background.initialPlayerStatValues.findIndex(
          (sv) => sv.statId === oldId
        );

        if (statValueIndex !== -1) {
          background.initialPlayerStatValues[statValueIndex].statId = newId;
          hasChanges = true;
        }
      });
    });

    // Only update if we actually made changes
    if (hasChanges) {
      return updatedPlayerOptions;
    }

    return null;
  };

  const handleAddStat = (type: "shared" | "player") => {
    const prefix = type === "shared" ? "shared_" : "player_";
    const tempId = `${prefix}new_stat_${Date.now()}`;
    const newStat: Stat = {
      id: tempId,
      name: "",
      type: "percentage",
      group: statGroups[0] || "",
      possibleValues: "",
      effectOnPoints: [],
      optionsToSacrifice: "",
      optionsToGainAsReward: "",
      narrativeImplications: [],
      adjustmentsAfterThreads: [],
      canBeChangedInBeatResolutions: true,
      isVisible: true,
      tooltip: "",
    };

    // Start in edit mode
    setEditingStats((prev) => new Set(prev).add(tempId));

    if (type === "shared") {
      onChange({
        sharedStats: [...sharedStats, newStat],
        initialSharedStatValues: [
          ...initialSharedStatValues,
          {
            statId: tempId,
            value:
              newStat.type === "string"
                ? ""
                : newStat.type === "string[]"
                ? []
                : 50,
          },
        ],
      });
    } else {
      // For player stats, also add entries to each character background
      const updatedPlayerOptions = { ...playerOptions };

      // Add the new stat to each character background's initial values
      Object.keys(updatedPlayerOptions).forEach((playerSlot) => {
        const player = updatedPlayerOptions[playerSlot as PlayerSlot];

        player.possibleCharacterBackgrounds.forEach((background) => {
          background.initialPlayerStatValues.push({
            statId: tempId,
            value:
              newStat.type === "string"
                ? ""
                : newStat.type === "string[]"
                ? []
                : 50,
          });
        });
      });

      onChange({
        playerStats: [...playerStats, newStat],
        playerOptions: updatedPlayerOptions,
      });
    }
  };

  const handleUpdateStat = (
    type: "shared" | "player",
    index: number,
    updates: Partial<Stat>
  ) => {
    const oldStat = type === "shared" ? sharedStats[index] : playerStats[index];
    const oldId = oldStat?.id;
    const newId = updates.id;

    // Check if ID is changing
    const isIdChanging = newId && oldId !== newId;

    if (type === "shared") {
      const updated = sharedStats.map((stat, i) =>
        i === index ? { ...stat, ...updates } : stat
      );

      onChange({ sharedStats: updated });
    } else {
      const updated = playerStats.map((stat, i) =>
        i === index ? { ...stat, ...updates } : stat
      );

      // If player stat ID is changing, we need to update all references
      if (isIdChanging) {
        const updatedPlayerOptions = updatePlayerStatReferences(oldId, newId);

        if (updatedPlayerOptions) {
          onChange({
            playerStats: updated,
            playerOptions: updatedPlayerOptions,
          });
        } else {
          onChange({ playerStats: updated });
        }
      } else {
        onChange({ playerStats: updated });
      }
    }
  };

  const handleRemoveStat = (type: "shared" | "player", index: number) => {
    if (type === "shared") {
      const updated = sharedStats.filter((_, i) => i !== index);
      const updatedValues = initialSharedStatValues.filter((entry) =>
        updated.some((stat) => stat.id === entry.statId)
      );
      onChange({
        sharedStats: updated,
        initialSharedStatValues: updatedValues,
      });
    } else {
      const statIdToRemove = playerStats[index].id;
      const updated = playerStats.filter((_, i) => i !== index);

      // Also remove this stat from all character backgrounds
      const updatedPlayerOptions = { ...playerOptions };
      let hasChanges = false;

      Object.keys(updatedPlayerOptions).forEach((playerSlot) => {
        const player = updatedPlayerOptions[playerSlot as PlayerSlot];

        player.possibleCharacterBackgrounds.forEach((background) => {
          const originalLength = background.initialPlayerStatValues.length;
          background.initialPlayerStatValues =
            background.initialPlayerStatValues.filter(
              (sv) => sv.statId !== statIdToRemove
            );

          if (originalLength !== background.initialPlayerStatValues.length) {
            hasChanges = true;
          }
        });
      });

      if (hasChanges) {
        onChange({
          playerStats: updated,
          playerOptions: updatedPlayerOptions,
        });
      } else {
        onChange({ playerStats: updated });
      }
    }
  };

  const handleUpdateInitialValue = (
    statId: string,
    value: number | string | string[]
  ) => {
    const updated = initialSharedStatValues.map((entry) =>
      entry.statId === statId ? { ...entry, value } : entry
    );
    onChange({ initialSharedStatValues: updated });
  };

  // Function to convert a stat between shared and player types
  const handleConvertStat = (
    sourceType: "shared" | "player",
    index: number
  ) => {
    // Get the stat to convert
    const statToConvert =
      sourceType === "shared" ? sharedStats[index] : playerStats[index];

    if (!statToConvert) return;

    // If the stat is currently being edited, remove it from editing mode first
    if (editingStats.has(statToConvert.id)) {
      setEditingStats((prev) => {
        const next = new Set(prev);
        next.delete(statToConvert.id);
        return next;
      });
    }

    // Create a new ID with the appropriate prefix
    const targetType = sourceType === "shared" ? "player" : "shared";
    const newId = statToConvert.id.replace(
      /^(shared_|player_)/,
      targetType === "shared" ? "shared_" : "player_"
    );

    // Create a copy of the stat with the new ID
    const convertedStat: Stat = {
      ...statToConvert,
      id: newId,
    };

    // Handle updates to playerOptions if needed
    let updatedPlayerOptions = null;
    const oldId = statToConvert.id;

    if (sourceType === "player") {
      // Converting from player to shared - need to update references
      updatedPlayerOptions = updatePlayerStatReferences(oldId, newId);
    }

    if (sourceType === "shared") {
      // Converting from shared to player
      // 1. Remove from shared stats
      const updatedSharedStats = sharedStats.filter((_, i) => i !== index);
      // 2. Add to player stats
      const updatedPlayerStats = [...playerStats, convertedStat];
      // 3. Remove from shared values
      const updatedValues = initialSharedStatValues.filter(
        (entry) => entry.statId !== statToConvert.id
      );

      // 4. Add stat to all character backgrounds
      const newPlayerOptions = { ...playerOptions };

      // Initialize this stat for all character backgrounds
      Object.keys(newPlayerOptions).forEach((playerSlot) => {
        const player = newPlayerOptions[playerSlot as PlayerSlot];

        player.possibleCharacterBackgrounds.forEach((background) => {
          // Check if the stat is already there (should not be, but just to be safe)
          if (
            !background.initialPlayerStatValues.some(
              (sv) => sv.statId === newId
            )
          ) {
            // Add the stat with an initial value
            background.initialPlayerStatValues.push({
              statId: newId,
              value:
                convertedStat.type === "string"
                  ? ""
                  : convertedStat.type === "string[]"
                  ? []
                  : 50,
            });
          }
        });
      });

      onChange({
        sharedStats: updatedSharedStats,
        playerStats: updatedPlayerStats,
        initialSharedStatValues: updatedValues,
        playerOptions: newPlayerOptions,
      });
    } else {
      // Converting from player to shared
      // 1. Remove from player stats
      const updatedPlayerStats = playerStats.filter((_, i) => i !== index);
      // 2. Add to shared stats
      const updatedSharedStats = [...sharedStats, convertedStat];
      // 3. Add initial value for the new shared stat
      const initialValue =
        convertedStat.type === "string"
          ? ""
          : convertedStat.type === "string[]"
          ? []
          : 50;

      const updatedValues = [
        ...initialSharedStatValues,
        { statId: newId, value: initialValue },
      ];

      onChange({
        playerStats: updatedPlayerStats,
        sharedStats: updatedSharedStats,
        initialSharedStatValues: updatedValues,
        playerOptions: updatedPlayerOptions || undefined,
      });
    }
  };

  const StatEditor = ({
    stat,
    index,
    type,
  }: {
    stat: Stat;
    index: number;
    type: "shared" | "player";
  }) => {
    const isEditing = editingStats.has(stat.id);
    const [localStat, setLocalStat] = useState<Stat>(stat);
    const [localInitialValue, setLocalInitialValue] = useState<
      number | string | string[]
    >(() => {
      if (type === "shared") {
        const foundValue = initialSharedStatValues.find(
          (v) => v.statId === stat.id
        )?.value;
        if (stat.type === "string") return "";
        if (stat.type === "string[]") return [];
        return typeof foundValue === "number" ? foundValue : 50;
      }
      return 50;
    });

    // Update local state when prop changes
    useEffect(() => {
      setLocalStat(stat);
      if (type === "shared") {
        const foundValue = initialSharedStatValues.find(
          (v) => v.statId === stat.id
        )?.value;

        if (foundValue !== undefined) {
          setLocalInitialValue(foundValue);
        } else if (stat.type === "string") {
          setLocalInitialValue("");
        } else if (stat.type === "string[]") {
          setLocalInitialValue([]);
        } else {
          setLocalInitialValue(50);
        }
      }
    }, [stat, stat.id, type]);

    if (!isEditing) {
      return (
        <div className="bg-white p-4 rounded-lg shadow mb-4 flex justify-between items-center">
          <div className="flex items-center">
            <span
              className={`w-2 h-2 rounded-full mr-2 ${
                type === "shared" ? "bg-blue-500" : "bg-green-500"
              }`}
              title={
                type === "shared"
                  ? "Shared stat (applies to all players)"
                  : "Player stat (unique to each player)"
              }
            ></span>
            <span className="font-medium">{stat.name}</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() =>
                setEditingStats((prev) => new Set(prev).add(stat.id))
              }
              className="text-secondary hover:text-secondary-700"
              aria-label={`Edit ${stat.name}`}
            >
              <Icons.Edit className="h-5 w-5" />
            </button>
            <button
              onClick={() => handleConvertStat(type, index)}
              className="text-blue-500 hover:text-blue-700"
              aria-label={`Convert ${stat.name} to ${
                type === "shared" ? "player" : "shared"
              } stat`}
              title={`Convert to ${
                type === "shared" ? "player" : "shared"
              } stat`}
            >
              <Icons.SwitchHorizontal className="h-5 w-5" />
            </button>
            <button
              onClick={() => handleRemoveStat(type, index)}
              className="text-tertiary hover:text-tertiary-700"
              aria-label={`Remove ${stat.name}`}
            >
              <Icons.Trash className="h-5 w-5" />
            </button>
          </div>
        </div>
      );
    }

    const handleSave = () => {
      if (
        localStat.name &&
        localStat.id.startsWith(type === "shared" ? "shared_" : "player_")
      ) {
        // Check if ID has changed
        const oldId = stat.id;
        const isIdChanged = oldId !== localStat.id;

        // Update the stat
        handleUpdateStat(type, index, localStat);

        if (type === "shared") {
          // Update initial value with the correct ID
          const valueToStore =
            localStat.type === "string" || localStat.type === "string[]"
              ? localInitialValue
              : Number(localInitialValue);

          // If the ID has changed, update the initialSharedStatValues entries
          if (isIdChanged) {
            // Check if there's already an entry for this stat
            const hasExistingEntry = initialSharedStatValues.some(
              (entry) => entry.statId === oldId
            );

            if (hasExistingEntry) {
              // Update the existing entry
              const updatedValues = initialSharedStatValues.map((entry) =>
                entry.statId === oldId
                  ? { ...entry, statId: localStat.id, value: valueToStore }
                  : entry
              );
              onChange({ initialSharedStatValues: updatedValues });
            } else {
              // Add a new entry (this is a newly created stat or one without an initial value)
              const updatedValues = [
                ...initialSharedStatValues,
                { statId: localStat.id, value: valueToStore },
              ];
              onChange({ initialSharedStatValues: updatedValues });
            }
          } else {
            // Otherwise just update the value
            handleUpdateInitialValue(localStat.id, valueToStore);
          }
        } else if (isIdChanged) {
          // For player stats, if ID changed, update references in playerOptions
          const updatedPlayerOptions = updatePlayerStatReferences(
            oldId,
            localStat.id
          );
          if (updatedPlayerOptions) {
            onChange({ playerOptions: updatedPlayerOptions });
          }
        }

        setEditingStats((prev) => {
          const next = new Set(prev);
          next.delete(stat.id);
          return next;
        });
      }
    };

    return (
      <div className="bg-white p-4 rounded-lg shadow mb-4">
        <div className="flex justify-between items-start mb-4">
          <div className="flex-1 space-y-4 mr-4">
            <div className="flex items-center gap-2">
              <span className="font-semibold w-24">Name</span>
              <Input
                id={`stat-name-${stat.id}`}
                name={`stat-name-${stat.id}`}
                className="flex-1"
                value={localStat.name}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setLocalStat((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder="Enter stat name"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold w-24">ID</span>
              <div className="flex flex-1">
                <span className="inline-flex items-center px-3 rounded-l border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm">
                  {type === "shared" ? "shared_" : "player_"}
                </span>
                <input
                  id={`stat-id-${stat.id}`}
                  name={`stat-id-${stat.id}`}
                  className="flex-1 p-2 border rounded-r"
                  value={localStat.id.replace(/^(shared_|player_)/, "")}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    const prefix = type === "shared" ? "shared_" : "player_";
                    const newId = prefix + e.target.value;

                    // Only update local state, don't update parent state yet
                    setLocalStat((prev) => ({
                      ...prev,
                      id: newId,
                    }));

                    // We'll wait until save to update initialSharedStatValues
                  }}
                  placeholder="Enter stat ID"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold w-24">Description</span>
              <Input
                id={`stat-description-${stat.id}`}
                name={`stat-description-${stat.id}`}
                className="flex-1"
                value={localStat.tooltip}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setLocalStat((prev) => ({ ...prev, tooltip: e.target.value }))
                }
                placeholder="Enter stat description"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold w-24">Group</span>
              <select
                id={`stat-group-${stat.id}`}
                name={`stat-group-${stat.id}`}
                className="flex-1 p-2 border rounded"
                value={localStat.group}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setLocalStat((prev) => ({ ...prev, group: e.target.value }))
                }
              >
                {statGroups.map((group, i) => (
                  <option key={i} value={group}>
                    {group}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold w-24">Type</span>
              <select
                id={`stat-type-${stat.id}`}
                name={`stat-type-${stat.id}`}
                className="flex-1 p-2 border rounded"
                value={localStat.type}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                  const newType = e.target.value as Stat["type"];
                  setLocalStat((prev) => ({
                    ...prev,
                    type: newType,
                  }));
                  // Reset initial value based on type
                  if (type === "shared") {
                    if (newType === "string") {
                      setLocalInitialValue("");
                    } else if (newType === "string[]") {
                      setLocalInitialValue([]);
                    } else {
                      setLocalInitialValue(50);
                    }
                  }
                }}
              >
                <option value="percentage">Percentage</option>
                <option value="number">Number</option>
                <option value="string">String</option>
                <option value="string[]">String List</option>
                <option value="opposites">Opposites</option>
              </select>
            </div>

            {type === "shared" && (
              <div className="flex items-center gap-2">
                <StatValueInput
                  statType={localStat.type}
                  value={localInitialValue}
                  onChange={(value) => setLocalInitialValue(value)}
                  placeholder="Enter initial value"
                  className="flex-1"
                  label="Initial Value"
                />
              </div>
            )}
            {/* Additional stat fields */}
            {(localStat.type === "string" || localStat.type === "string[]") && (
              <div className="flex items-center gap-2">
                <span className="font-semibold w-40">Possible Values</span>
                <Input
                  id={`stat-possible-values-${stat.id}`}
                  name={`stat-possible-values-${stat.id}`}
                  className="flex-1"
                  value={localStat.possibleValues}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setLocalStat((prev) => ({
                      ...prev,
                      possibleValues: e.target.value,
                    }))
                  }
                  placeholder={
                    localStat.type === "string"
                      ? "e.g., Novice, Apprentice, Master"
                      : "e.g., only minor spells, (max 4 items)"
                  }
                />
              </div>
            )}
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id={`stat-visible-${stat.id}`}
                  name={`stat-visible-${stat.id}`}
                  checked={localStat.isVisible}
                  onChange={(e) =>
                    setLocalStat((prev) => ({
                      ...prev,
                      isVisible: e.target.checked,
                    }))
                  }
                />
                <label
                  htmlFor={`stat-visible-${stat.id}`}
                  className="font-semibold"
                >
                  Visible to players
                </label>
              </div>
              <div>
                <div className="flex justify-between items-center mb-1">
                  <div className="flex items-center">
                    <h3 className="font-semibold">Narrative Implications</h3>
                    <InfoIcon
                      tooltipText="How this stat affects the story narrative"
                      position="right"
                      className="ml-2 mt-1"
                    />
                  </div>
                  <PrimaryButton
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setLocalStat((prev) => ({
                        ...prev,
                        narrativeImplications: [
                          ...prev.narrativeImplications,
                          "",
                        ],
                      }));
                    }}
                    leftIcon={<Icons.Plus className="h-4 w-4" />}
                  >
                    Add
                  </PrimaryButton>
                </div>
                {localStat.narrativeImplications.length === 0 ? (
                  <Input
                    id={`new-implication-${stat.id}`}
                    name={`new-implication-${stat.id}`}
                    placeholder="Click + to add narrative implications"
                    disabled
                  />
                ) : (
                  localStat.narrativeImplications.map((implication, idx) => (
                    <div key={idx} className="flex gap-2 mb-2">
                      <Input
                        id={`stat-implication-${stat.id}-${idx}`}
                        name={`stat-implication-${stat.id}-${idx}`}
                        className="flex-1"
                        value={implication}
                        onChange={(e) => {
                          const newImplications = [
                            ...localStat.narrativeImplications,
                          ];
                          newImplications[idx] = e.target.value;
                          setLocalStat((prev) => ({
                            ...prev,
                            narrativeImplications: newImplications,
                          }));
                        }}
                        placeholder="e.g., Below 30% causes visible weakness"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const newImplications =
                            localStat.narrativeImplications.filter(
                              (_, i) => i !== idx
                            );
                          setLocalStat((prev) => ({
                            ...prev,
                            narrativeImplications: newImplications,
                          }));
                        }}
                        className="text-tertiary hover:text-tertiary-700"
                        aria-label={`Remove implication ${idx + 1}`}
                      >
                        <Icons.Trash className="h-4 w-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div>
              <div className="flex justify-between items-center mb-1">
                <div className="flex items-center">
                  <h3 className="font-semibold">Effect on Points</h3>
                  <InfoIcon
                    tooltipText="How this stat affects point calculations"
                    position="right"
                    className="ml-2 mt-1"
                  />
                </div>
                <PrimaryButton
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setLocalStat((prev) => ({
                      ...prev,
                      effectOnPoints: [...prev.effectOnPoints, ""],
                    }));
                  }}
                  leftIcon={<Icons.Plus className="h-4 w-4" />}
                >
                  Add
                </PrimaryButton>
              </div>
              {localStat.effectOnPoints.length === 0 ? (
                <Input
                  id={`new-effect-${stat.id}`}
                  name={`new-effect-${stat.id}`}
                  placeholder="Click + to add effects"
                  disabled
                />
              ) : (
                localStat.effectOnPoints.map((effect, idx) => (
                  <div key={idx} className="flex gap-2 mb-2">
                    <Input
                      id={`stat-effect-${stat.id}-${idx}`}
                      name={`stat-effect-${stat.id}-${idx}`}
                      className="flex-1"
                      value={effect}
                      onChange={(e) => {
                        const newEffects = [...localStat.effectOnPoints];
                        newEffects[idx] = e.target.value;
                        setLocalStat((prev) => ({
                          ...prev,
                          effectOnPoints: newEffects,
                        }));
                      }}
                      placeholder="e.g., Above 70% provides +15 points to social challenges"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const newEffects = localStat.effectOnPoints.filter(
                          (_, i) => i !== idx
                        );
                        setLocalStat((prev) => ({
                          ...prev,
                          effectOnPoints: newEffects,
                        }));
                      }}
                      className="text-tertiary hover:text-tertiary-700"
                      aria-label={`Remove effect ${idx + 1}`}
                    >
                      <Icons.Trash className="h-4 w-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold w-48">Sacrifice Options</span>
              <Input
                id={`stat-sacrifice-options-${stat.id}`}
                name={`stat-sacrifice-options-${stat.id}`}
                className="flex-1"
                value={localStat.optionsToSacrifice}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setLocalStat((prev) => ({
                    ...prev,
                    optionsToSacrifice: e.target.value,
                  }))
                }
                placeholder="How can this stat be sacrificed for bonuses?"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold w-48">Reward Options</span>
              <Input
                id={`stat-reward-options-${stat.id}`}
                name={`stat-reward-options-${stat.id}`}
                className="flex-1"
                value={localStat.optionsToGainAsReward}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setLocalStat((prev) => ({
                    ...prev,
                    optionsToGainAsReward: e.target.value,
                  }))
                }
                placeholder="How can this stat be gained as a reward?"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id={`stat-beat-changes-${stat.id}`}
                name={`stat-beat-changes-${stat.id}`}
                checked={localStat.canBeChangedInBeatResolutions}
                onChange={(e) =>
                  setLocalStat((prev) => ({
                    ...prev,
                    canBeChangedInBeatResolutions: e.target.checked,
                  }))
                }
              />
              <label
                htmlFor={`stat-beat-changes-${stat.id}`}
                className="font-semibold"
              >
                Can be changed in beat resolutions
              </label>
            </div>
            <div>
              <div className="flex justify-between items-center mb-1">
                <div className="flex items-center">
                  <h3 className="font-semibold">Adjustments After Threads</h3>
                  <InfoIcon
                    tooltipText="How this stat changes after completing story threads"
                    position="right"
                    className="ml-2 mt-1"
                  />
                </div>
                <PrimaryButton
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setLocalStat((prev) => ({
                      ...prev,
                      adjustmentsAfterThreads: [
                        ...prev.adjustmentsAfterThreads,
                        "",
                      ],
                    }));
                  }}
                  leftIcon={<Icons.Plus className="h-4 w-4" />}
                >
                  Add
                </PrimaryButton>
              </div>
              {localStat.adjustmentsAfterThreads.length === 0 ? (
                <Input
                  id={`new-adjustment-${stat.id}`}
                  name={`new-adjustment-${stat.id}`}
                  placeholder="Click + to add thread adjustments"
                  disabled
                />
              ) : (
                localStat.adjustmentsAfterThreads.map((adjustment, idx) => (
                  <div key={idx} className="flex gap-2 mb-2">
                    <Input
                      id={`stat-adjustment-${stat.id}-${idx}`}
                      name={`stat-adjustment-${stat.id}-${idx}`}
                      className="flex-1"
                      value={adjustment}
                      onChange={(e) => {
                        const newAdjustments = [
                          ...localStat.adjustmentsAfterThreads,
                        ];
                        newAdjustments[idx] = e.target.value;
                        setLocalStat((prev) => ({
                          ...prev,
                          adjustmentsAfterThreads: newAdjustments,
                        }));
                      }}
                      placeholder="e.g., Mana regenerates by 10% after each thread"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const newAdjustments =
                          localStat.adjustmentsAfterThreads.filter(
                            (_, i) => i !== idx
                          );
                        setLocalStat((prev) => ({
                          ...prev,
                          adjustmentsAfterThreads: newAdjustments,
                        }));
                      }}
                      className="text-tertiary hover:text-tertiary-700"
                      aria-label={`Remove adjustment ${idx + 1}`}
                    >
                      <Icons.Trash className="h-4 w-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => handleRemoveStat(type, index)}
              className="text-tertiary hover:text-tertiary-700"
              aria-label="Remove stat"
            >
              <Icons.Trash className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <PrimaryButton
            onClick={handleSave}
            disabled={!localStat.name}
            variant="outline"
          >
            Save
          </PrimaryButton>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8">
      {/* Stat Groups */}
      <section>
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center">
            <h3 className="font-semibold">Stat Groups</h3>
            <InfoIcon
              tooltipText="Categories to organize stats"
              position="right"
              className="ml-2 mt-1"
            />
          </div>
          <PrimaryButton
            variant="outline"
            size="sm"
            onClick={() => {
              onChange({ statGroups: [...statGroups, ""] });
            }}
            leftIcon={<Icons.Plus className="h-4 w-4" />}
          >
            Add
          </PrimaryButton>
        </div>
        {statGroups.length === 0 ? (
          <p className="text-gray-500">Add at least one stat group</p>
        ) : (
          <div className="space-y-2">
            {statGroups.map((group, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  id={`stat-group-${index}`}
                  name={`stat-group-${index}`}
                  value={group}
                  onChange={(e) => {
                    const updated = [...statGroups];
                    updated[index] = e.target.value;
                    onChange({ statGroups: updated });
                  }}
                  placeholder="Enter group name"
                />
                <button
                  type="button"
                  onClick={() => handleRemoveGroup(index)}
                  className="text-tertiary hover:text-tertiary-700"
                  aria-label={`Remove stat group ${group || index + 1}`}
                >
                  <Icons.Trash className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Shared Stats */}
      <section>
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center">
            <h3 className="text-lg font-semibold flex items-center">
              <span
                className="w-3 h-3 rounded-full bg-blue-500 mr-2"
                title="Shared stats apply to all players"
              ></span>
              Shared Stats
            </h3>
            <InfoIcon
              tooltipText="Stats shared by all players in the game"
              position="right"
              className="ml-2 mt-1"
            />
          </div>
          <PrimaryButton
            variant="outline"
            size="sm"
            onClick={() => handleAddStat("shared")}
            disabled={statGroups.length === 0}
            leftIcon={<Icons.Plus className="h-4 w-4" />}
          >
            Add
          </PrimaryButton>
        </div>
        {statGroups.length === 0 ? (
          <p className="text-gray-500">Add at least one stat group first</p>
        ) : (
          sharedStats.map((stat, index) => (
            <StatEditor key={stat.id} stat={stat} index={index} type="shared" />
          ))
        )}
      </section>

      {/* Player Stats */}
      <section>
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center">
            <h3 className="text-lg font-semibold flex items-center">
              <span
                className="w-3 h-3 rounded-full bg-green-500 mr-2"
                title="Player stats are unique to each player"
              ></span>
              Player Stats
            </h3>
            <InfoIcon
              tooltipText="Stats that are unique to each player"
              position="right"
              className="ml-2 mt-1"
            />
          </div>
          <PrimaryButton
            variant="outline"
            size="sm"
            onClick={() => handleAddStat("player")}
            disabled={statGroups.length === 0}
            leftIcon={<Icons.Plus className="h-4 w-4" />}
          >
            Add
          </PrimaryButton>
        </div>
        {statGroups.length === 0 ? (
          <p className="text-gray-500">Add at least one stat group first</p>
        ) : (
          playerStats.map((stat, index) => (
            <StatEditor key={stat.id} stat={stat} index={index} type="player" />
          ))
        )}
      </section>
    </div>
  );
};
