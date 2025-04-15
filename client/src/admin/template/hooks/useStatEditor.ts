import {
  Stat,
  StatValueEntry,
  PlayerSlot,
  PlayerOptionsGeneration,
} from "@core/types";
import { useState, useEffect } from "react";

interface StatEditorHelperProps {
  statGroups: string[];
  sharedStats: Stat[];
  playerStats: Stat[];
  initialSharedStatValues: StatValueEntry[];
  playerOptions: Record<PlayerSlot, PlayerOptionsGeneration>;
  editingStats: Set<string>;
  onChange: (updates: {
    statGroups?: string[];
    sharedStats?: Stat[];
    playerStats?: Stat[];
    initialSharedStatValues?: StatValueEntry[];
    playerOptions?: Record<PlayerSlot, PlayerOptionsGeneration>;
  }) => void;
  setEditingStats: (updater: (prev: Set<string>) => Set<string>) => void;
}

export const useStatEditorHelpers = ({
  statGroups,
  sharedStats,
  playerStats,
  initialSharedStatValues,
  playerOptions,
  editingStats,
  onChange,
  setEditingStats,
}: StatEditorHelperProps) => {
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

      // If ID is changing and we have a shared stat, update initialSharedStatValues too
      if (isIdChanging) {
        const updatedValues = initialSharedStatValues.map((entry) =>
          entry.statId === oldId ? { ...entry, statId: newId } : entry
        );
        onChange({ initialSharedStatValues: updatedValues });
      }
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

  return {
    updatePlayerStatReferences,
    handleAddStat,
    handleUpdateStat,
    handleRemoveStat,
    handleUpdateInitialValue,
    handleConvertStat,
  };
};

interface UseStatEditorProps {
  stat: Stat;
  index: number;
  type: "shared" | "player";
  initialValue?: StatValueEntry["value"];
  onUpdateInitialValue?: (
    statId: string,
    value: number | string | string[]
  ) => void;
  onUpdateStat: (
    type: "shared" | "player",
    index: number,
    updates: Partial<Stat>
  ) => void;
  onRemoveStat: (type: "shared" | "player", index: number) => void;
  setEditingStats: (updater: (prev: Set<string>) => Set<string>) => void;
}

interface UseStatEditorResult {
  localStat: Stat;
  localInitialValue: number | string | string[];
  setLocalInitialValue: (value: number | string | string[]) => void;
  handleSave: () => void;
  updateStatField: <K extends keyof Stat>(field: K, value: Stat[K]) => void;
  updateArrayField: <K extends keyof Stat>(
    field: K,
    index: number,
    value: string
  ) => void;
  removeArrayItem: <K extends keyof Stat>(field: K, index: number) => void;
  addArrayItem: <K extends keyof Stat>(field: K) => void;
  handleRemoveStat: () => void;
}

export const useStatEditor = ({
  stat,
  index,
  type,
  initialValue,
  onUpdateInitialValue,
  onUpdateStat,
  onRemoveStat,
  setEditingStats,
}: UseStatEditorProps): UseStatEditorResult => {
  const [localStat, setLocalStat] = useState<Stat>(stat);
  const [localInitialValue, setLocalInitialValue] = useState<
    number | string | string[]
  >(
    initialValue ||
      (stat.type === "string" ? "" : stat.type === "string[]" ? [] : 50)
  );

  // Update local state when prop changes
  useEffect(() => {
    setLocalStat(stat);
    if (initialValue !== undefined) {
      setLocalInitialValue(initialValue);
    } else if (stat.type === "string") {
      setLocalInitialValue("");
    } else if (stat.type === "string[]") {
      setLocalInitialValue([]);
    } else {
      setLocalInitialValue(50);
    }
  }, [stat, initialValue]);

  const handleSave = () => {
    if (
      localStat.name &&
      localStat.id.startsWith(type === "shared" ? "shared_" : "player_")
    ) {
      // Update the stat
      onUpdateStat(type, index, localStat);

      // Update initial value if needed
      if (type === "shared" && onUpdateInitialValue) {
        const valueToStore =
          localStat.type === "string" || localStat.type === "string[]"
            ? localInitialValue
            : Number(localInitialValue);

        onUpdateInitialValue(localStat.id, valueToStore);
      }

      // Exit edit mode
      setEditingStats((prev) => {
        const next = new Set(prev);
        next.delete(stat.id);
        return next;
      });
    }
  };

  const updateStatField = <K extends keyof Stat>(field: K, value: Stat[K]) => {
    setLocalStat((prev) => ({ ...prev, [field]: value }));
  };

  const updateArrayField = <K extends keyof Stat>(
    field: K,
    index: number,
    value: string
  ) => {
    setLocalStat((prev) => {
      const array = [...(prev[field] as string[])];
      array[index] = value;
      return { ...prev, [field]: array };
    });
  };

  const removeArrayItem = <K extends keyof Stat>(field: K, index: number) => {
    setLocalStat((prev) => {
      const array = (prev[field] as string[]).filter((_, i) => i !== index);
      return { ...prev, [field]: array };
    });
  };

  const addArrayItem = <K extends keyof Stat>(field: K) => {
    setLocalStat((prev) => {
      const array = [...(prev[field] as string[]), ""];
      return { ...prev, [field]: array };
    });
  };

  const handleRemoveStat = () => {
    onRemoveStat(type, index);
  };

  return {
    localStat,
    localInitialValue,
    setLocalInitialValue,
    handleSave,
    updateStatField,
    updateArrayField,
    removeArrayItem,
    addArrayItem,
    handleRemoveStat,
  };
};
