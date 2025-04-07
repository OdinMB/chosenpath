import { useState, useEffect } from "react";
import { PrimaryButton } from "@components/ui/PrimaryButton";
import { Icons } from "@components/ui/Icons";
import { Input } from "@components/ui/Input";
import { Stat, StatValueEntry } from "@core/types/stat";

type StatsTabProps = {
  statGroups: string[];
  sharedStats: Stat[];
  playerStats: Stat[];
  initialSharedStatValues: StatValueEntry[];
  onChange: (updates: {
    statGroups?: string[];
    sharedStats?: Stat[];
    playerStats?: Stat[];
    initialSharedStatValues?: StatValueEntry[];
  }) => void;
};

export const StatsTab = ({
  statGroups,
  sharedStats,
  playerStats,
  initialSharedStatValues,
  onChange,
}: StatsTabProps) => {
  // Track which stats are being edited by their IDs
  const [editingStats, setEditingStats] = useState<Set<string>>(new Set());

  const handleRemoveGroup = (index: number) => {
    const updated = statGroups.filter((_, i) => i !== index);
    onChange({ statGroups: updated });
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
      onChange({ playerStats: [...playerStats, newStat] });
    }
  };

  const handleUpdateStat = (
    type: "shared" | "player",
    index: number,
    updates: Partial<Stat>
  ) => {
    if (type === "shared") {
      const updated = sharedStats.map((stat, i) =>
        i === index ? { ...stat, ...updates } : stat
      );
      onChange({ sharedStats: updated });
    } else {
      const updated = playerStats.map((stat, i) =>
        i === index ? { ...stat, ...updates } : stat
      );
      onChange({ playerStats: updated });
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
      const updated = playerStats.filter((_, i) => i !== index);
      onChange({ playerStats: updated });
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
          <span className="font-medium">{stat.name}</span>
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
        // Update the stat
        handleUpdateStat(type, index, localStat);
        if (type === "shared") {
          // Update initial value with the correct ID
          const valueToStore =
            localStat.type === "string" || localStat.type === "string[]"
              ? localInitialValue
              : Number(localInitialValue);
          handleUpdateInitialValue(localStat.id, valueToStore);
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
            <div className="flex flex-col gap-2">
              <h3 className="font-semibold mb-1">Name</h3>
              <Input
                id={`stat-name-${stat.id}`}
                name={`stat-name-${stat.id}`}
                value={localStat.name}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setLocalStat((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder="Enter stat name"
              />
            </div>
            <div className="flex flex-col gap-2">
              <h3 className="font-semibold mb-1">ID</h3>
              <div className="flex">
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

                    // Update the stat's ID
                    setLocalStat((prev) => ({
                      ...prev,
                      id: newId,
                    }));

                    // If this is a shared stat, also update the initialSharedStatValues
                    if (type === "shared") {
                      const updatedValues = initialSharedStatValues.map(
                        (entry) =>
                          entry.statId === stat.id
                            ? { ...entry, statId: newId }
                            : entry
                      );
                      onChange({ initialSharedStatValues: updatedValues });
                    }
                  }}
                  placeholder="Enter stat ID"
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <h3 className="font-semibold mb-1">Description</h3>
              <Input
                id={`stat-description-${stat.id}`}
                name={`stat-description-${stat.id}`}
                value={localStat.tooltip}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setLocalStat((prev) => ({ ...prev, tooltip: e.target.value }))
                }
                placeholder="Enter stat description"
              />
            </div>
            <div className="flex flex-col gap-2">
              <h3 className="font-semibold mb-1">Type</h3>
              <select
                id={`stat-type-${stat.id}`}
                name={`stat-type-${stat.id}`}
                className="w-full p-2 border rounded"
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
            <div className="flex flex-col gap-2">
              <h3 className="font-semibold mb-1">Group</h3>
              <select
                id={`stat-group-${stat.id}`}
                name={`stat-group-${stat.id}`}
                className="w-full p-2 border rounded"
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
            {type === "shared" && (
              <div className="flex flex-col gap-2">
                <h3 className="font-semibold mb-1">Initial Value</h3>
                {localStat.type === "string" ? (
                  <Input
                    id={`stat-initial-value-${stat.id}`}
                    name={`stat-initial-value-${stat.id}`}
                    value={localInitialValue as string}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setLocalInitialValue(e.target.value)
                    }
                    placeholder="Enter initial value"
                  />
                ) : localStat.type === "string[]" ? (
                  <Input
                    id={`stat-initial-value-${stat.id}`}
                    name={`stat-initial-value-${stat.id}`}
                    value={
                      Array.isArray(localInitialValue)
                        ? localInitialValue.join(", ")
                        : ""
                    }
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      const inputValue = e.target.value;
                      // Only split if there's actual content
                      const values = inputValue
                        ? inputValue.split(",").map((s) => s.trim())
                        : [];
                      setLocalInitialValue(values);
                    }}
                    placeholder="Enter comma-separated values"
                  />
                ) : (
                  <Input
                    id={`stat-initial-value-${stat.id}`}
                    name={`stat-initial-value-${stat.id}`}
                    type="number"
                    value={localInitialValue as number}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setLocalInitialValue(Number(e.target.value))
                    }
                  />
                )}
              </div>
            )}

            {/* Additional stat fields */}
            {(localStat.type === "string" || localStat.type === "string[]") && (
              <div className="flex flex-col gap-2">
                <h3 className="font-semibold mb-1">Possible Values</h3>
                <Input
                  id={`stat-possible-values-${stat.id}`}
                  name={`stat-possible-values-${stat.id}`}
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
            </div>

            <div className="flex flex-col gap-2">
              <h3 className="font-semibold mb-1">Effect on Points</h3>
              <div className="space-y-2">
                {localStat.effectOnPoints.map((effect, idx) => (
                  <div key={idx} className="flex gap-2">
                    <Input
                      id={`stat-effect-${stat.id}-${idx}`}
                      name={`stat-effect-${stat.id}-${idx}`}
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
                ))}
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
                  Add Effect
                </PrimaryButton>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <h3 className="font-semibold mb-1">Options to Sacrifice</h3>
              <Input
                id={`stat-sacrifice-options-${stat.id}`}
                name={`stat-sacrifice-options-${stat.id}`}
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

            <div className="flex flex-col gap-2">
              <h3 className="font-semibold mb-1">Options to Gain as Reward</h3>
              <Input
                id={`stat-reward-options-${stat.id}`}
                name={`stat-reward-options-${stat.id}`}
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

            <div className="flex flex-col gap-2">
              <h3 className="font-semibold mb-1">Narrative Implications</h3>
              <div className="space-y-2">
                {localStat.narrativeImplications.map((implication, idx) => (
                  <div key={idx} className="flex gap-2">
                    <Input
                      id={`stat-implication-${stat.id}-${idx}`}
                      name={`stat-implication-${stat.id}-${idx}`}
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
                ))}
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
                  Add Implication
                </PrimaryButton>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <h3 className="font-semibold mb-1">Adjustments After Threads</h3>
              <div className="space-y-2">
                {localStat.adjustmentsAfterThreads.map((adjustment, idx) => (
                  <div key={idx} className="flex gap-2">
                    <Input
                      id={`stat-adjustment-${stat.id}-${idx}`}
                      name={`stat-adjustment-${stat.id}-${idx}`}
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
                ))}
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
                  Add Adjustment
                </PrimaryButton>
              </div>
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
          <h3 className="font-semibold">Stat Groups</h3>
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
          <h3 className="text-lg font-semibold">Shared Stats</h3>
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
          <h3 className="text-lg font-semibold">Player Stats</h3>
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
