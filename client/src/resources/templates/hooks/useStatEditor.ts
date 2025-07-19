import { Stat, PlayerSlot, PlayerOptionsGeneration, StatValueEntry } from "core/types";
import { useState, useEffect } from "react";

interface StatEditorHelperProps {
  statGroups: string[];
  sharedStats: Stat[];
  playerStats: Stat[];
  playerOptions: Record<PlayerSlot, PlayerOptionsGeneration>;
  editingStats: Set<string>;
  onChange?: (updates: {
    statGroups?: string[];
    sharedStats?: Stat[];
    playerStats?: Stat[];
    playerOptions?: Record<PlayerSlot, PlayerOptionsGeneration>;
  }) => void;
  setEditingStats: (updater: (prev: Set<string>) => Set<string>) => void;
  readOnly?: boolean;
}

export const useStatEditorHelpers = ({
  statGroups,
  sharedStats,
  playerStats,
  playerOptions,
  editingStats,
  onChange,
  setEditingStats,
  readOnly = false,
}: StatEditorHelperProps) => {
  // Store preserved values for stats when toggling partOfPlayerBackgrounds
  const [preservedValues, setPreservedValues] = useState<Map<string, {
    backgroundValues?: StatValueEntry[];
    initialValue?: string | number | string[];
  }>>(new Map());
  // Helper function to preserve current stat values before changes
  const preserveStatValues = (statId: string, currentStat: Stat) => {
    // Collect all current background values for this stat
    const backgroundValues: StatValueEntry[] = [];
    Object.values(playerOptions).forEach(playerOption => {
      playerOption.possibleCharacterBackgrounds.forEach(background => {
        const statValue = background.initialPlayerStatValues.find(sv => sv.statId === statId);
        if (statValue) {
          backgroundValues.push({ ...statValue });
        }
      });
    });

    // Store preserved values
    setPreservedValues(prev => new Map(prev).set(statId, {
      backgroundValues: backgroundValues.length > 0 ? backgroundValues : undefined,
      initialValue: currentStat.initialValue
    }));
  };

  // Helper function to restore preserved values when possible
  const restorePreservedValues = (statId: string) => {
    const preserved = preservedValues.get(statId);
    if (!preserved) return null;

    return preserved;
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
    if (readOnly || !onChange) return;

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
      partOfPlayerBackgrounds: true,
      initialValue: 50,
      tooltip: "",
    };

    // Start in edit mode
    setEditingStats((prev) => new Set(prev).add(tempId));

    if (type === "shared") {
      onChange({
        sharedStats: [...sharedStats, newStat],
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
    if (readOnly || !onChange) return;

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

      // Handle partOfPlayerBackgrounds change for player stats
      if (
        "partOfPlayerBackgrounds" in updates &&
        oldStat.partOfPlayerBackgrounds !== updates.partOfPlayerBackgrounds
      ) {
        console.log(
          `Player stat ${oldStat.name} partOfPlayerBackgrounds changed from ${oldStat.partOfPlayerBackgrounds} to ${updates.partOfPlayerBackgrounds}`
        );

        // Preserve current values before making changes
        preserveStatValues(oldStat.id, oldStat);

        if (
          updates.partOfPlayerBackgrounds === true &&
          oldStat.partOfPlayerBackgrounds === false
        ) {
          // Adding stat to player backgrounds
          const updatedPlayerOptions = addStatToPlayerBackgrounds(
            oldStat.id,
            oldStat.type,
            oldStat
          );
          onChange({
            playerStats: updated,
            playerOptions: updatedPlayerOptions,
          });
          return;
        } else if (
          updates.partOfPlayerBackgrounds === false &&
          oldStat.partOfPlayerBackgrounds === true
        ) {
          // Removing stat from player backgrounds
          const updatedPlayerOptions = removeStatFromPlayerBackgrounds(
            oldStat.id
          );
          
          // Try to restore preserved initialValue if available
          const preserved = restorePreservedValues(oldStat.id);
          const finalUpdated = updated.map((stat, i) => {
            if (i === index && preserved?.initialValue !== undefined) {
              console.log(`Restoring preserved initialValue for ${stat.name}: ${JSON.stringify(preserved.initialValue)}`);
              return { ...stat, initialValue: preserved.initialValue };
            }
            return stat;
          });
          
          onChange({
            playerStats: finalUpdated,
            playerOptions: updatedPlayerOptions,
          });
          return;
        }
      }

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

  // Helper function to add a stat to all player backgrounds
  const addStatToPlayerBackgrounds = (
    statId: string,
    statType: Stat["type"],
    preservedStat?: Stat
  ) => {
    console.log(`Adding ${statId} to player backgrounds`);
    const updatedPlayerOptions = { ...playerOptions };
    const preserved = restorePreservedValues(statId);

    let backgroundIndex = 0;
    // Add the stat to each character background's initial values
    Object.keys(updatedPlayerOptions).forEach((playerSlot) => {
      const player = updatedPlayerOptions[playerSlot as PlayerSlot];

      player.possibleCharacterBackgrounds.forEach((background) => {
        // Check if the stat is already there (should not be, but just to be safe)
        if (
          !background.initialPlayerStatValues.some((sv) => sv.statId === statId)
        ) {
          // Try to restore preserved value for this specific background
          let valueToUse;
          if (preserved?.backgroundValues && preserved.backgroundValues[backgroundIndex]) {
            valueToUse = preserved.backgroundValues[backgroundIndex].value;
            console.log(`Restored preserved value for ${statId} in background ${backgroundIndex}: ${JSON.stringify(valueToUse)}`);
          } else {
            // Use default value based on type
            valueToUse = preservedStat?.initialValue ?? (
              statType === "string" ? "" : statType === "string[]" ? [] : 50
            );
          }

          // Add the stat with the determined value
          background.initialPlayerStatValues.push({
            statId: statId,
            value: valueToUse,
          });
        }
        backgroundIndex++;
      });
    });

    return updatedPlayerOptions;
  };

  // Helper function to remove a stat from all player backgrounds
  const removeStatFromPlayerBackgrounds = (statId: string) => {
    console.log(`Removing ${statId} from player backgrounds`);
    const updatedPlayerOptions = { ...playerOptions };
    let hasChanges = false;

    Object.keys(updatedPlayerOptions).forEach((playerSlot) => {
      const player = updatedPlayerOptions[playerSlot as PlayerSlot];

      player.possibleCharacterBackgrounds.forEach((background) => {
        const originalLength = background.initialPlayerStatValues.length;
        background.initialPlayerStatValues =
          background.initialPlayerStatValues.filter(
            (sv) => sv.statId !== statId
          );

        if (originalLength !== background.initialPlayerStatValues.length) {
          hasChanges = true;
        }
      });
    });

    return hasChanges ? updatedPlayerOptions : playerOptions;
  };

  // Helper function to ensure all backgrounds have complete stat coverage
  const ensureBackgroundCompleteness = (
    updatedPlayerOptions: Record<PlayerSlot, PlayerOptionsGeneration>,
    requiredStats: Stat[]
  ) => {
    const result = { ...updatedPlayerOptions };
    let hasChanges = false;

    // Get stats that should be in backgrounds
    const backgroundStatIds = requiredStats
      .filter(stat => stat.partOfPlayerBackgrounds !== false)
      .map(stat => stat.id);

    // For each player option
    Object.keys(result).forEach(playerSlot => {
      const player = result[playerSlot as PlayerSlot];

      // For each background in this player option
      player.possibleCharacterBackgrounds.forEach(background => {
        const existingStatIds = new Set(
          background.initialPlayerStatValues.map(sv => sv.statId)
        );

        // Add missing stats
        backgroundStatIds.forEach(statId => {
          if (!existingStatIds.has(statId)) {
            const stat = requiredStats.find(s => s.id === statId);
            if (stat) {
              const defaultValue = stat.type === "string" ? "" : 
                                 stat.type === "string[]" ? [] : 50;
              
              background.initialPlayerStatValues.push({
                statId,
                value: defaultValue
              });
              hasChanges = true;
              console.log(`Added missing stat ${statId} to background ${background.title}`);
            }
          }
        });

        // Remove stats that shouldn't be in backgrounds
        const originalLength = background.initialPlayerStatValues.length;
        background.initialPlayerStatValues = background.initialPlayerStatValues.filter(
          sv => backgroundStatIds.includes(sv.statId)
        );
        
        if (background.initialPlayerStatValues.length !== originalLength) {
          hasChanges = true;
          console.log(`Removed invalid stats from background ${background.title}`);
        }
      });
    });

    return hasChanges ? result : updatedPlayerOptions;
  };

  const handleRemoveStat = (type: "shared" | "player", index: number) => {
    if (readOnly || !onChange) return;

    if (type === "shared") {
      const updated = sharedStats.filter((_, i) => i !== index);
      onChange({
        sharedStats: updated,
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

  // Function to convert a stat between shared and player types
  const handleConvertStat = (
    sourceType: "shared" | "player",
    index: number
  ) => {
    if (readOnly || !onChange) return;

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

    // For backwards compatibility with old templates
    if (convertedStat.partOfPlayerBackgrounds === undefined) {
      convertedStat.partOfPlayerBackgrounds = true;
      console.log(
        `Converting shared stat to player: setting partOfPlayerBackgrounds to true for ${convertedStat.name}`
      );
    }

    // Handle updates to playerOptions if needed
    let updatedPlayerOptions: Record<
      PlayerSlot,
      PlayerOptionsGeneration
    > | null = null;
    const oldId = statToConvert.id;

    if (sourceType === "player") {
      // Converting from player to shared - need to check if we should remove the stat from backgrounds
      if (statToConvert.partOfPlayerBackgrounds === true) {
        updatedPlayerOptions = removeStatFromPlayerBackgrounds(oldId);
      }
    }

    if (sourceType === "shared") {
      // Converting from shared to player
      // 1. Remove from shared stats
      const updatedSharedStats = sharedStats.filter((_, i) => i !== index);
      // 2. Add to player stats
      const updatedPlayerStats = [...playerStats, convertedStat];
      // 3. Remove from shared values

      // 4. Add stat to all character backgrounds if partOfPlayerBackgrounds is true
      let newPlayerOptions = { ...playerOptions };

      if (convertedStat.partOfPlayerBackgrounds === true) {
        newPlayerOptions = addStatToPlayerBackgrounds(
          newId,
          convertedStat.type
        );
      }

      onChange({
        sharedStats: updatedSharedStats,
        playerStats: updatedPlayerStats,
        playerOptions: newPlayerOptions,
      });
    } else {
      // Converting from player to shared
      // 1. Remove from player stats
      const updatedPlayerStats = playerStats.filter((_, i) => i !== index);
      // 2. Add to shared stats
      const updatedSharedStats = [...sharedStats, convertedStat];
      onChange({
        playerStats: updatedPlayerStats,
        sharedStats: updatedSharedStats,
        playerOptions: updatedPlayerOptions || undefined,
      });
    }
  };

  return {
    updatePlayerStatReferences,
    handleAddStat,
    handleUpdateStat,
    handleRemoveStat,
    handleConvertStat,
    ensureBackgroundCompleteness,
    readOnly,
  };
};

interface UseStatEditorProps {
  stat: Stat;
  index: number;
  type: "shared" | "player";
  onUpdateStat: (
    type: "shared" | "player",
    index: number,
    updates: Partial<Stat>
  ) => void;
  onRemoveStat: (type: "shared" | "player", index: number) => void;
  setEditingStats: (updater: (prev: Set<string>) => Set<string>) => void;
  readOnly?: boolean;
}

interface UseStatEditorResult {
  localStat: Stat;
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
  handleClose: () => void;
  readOnly: boolean;
  showDeleteConfirm: boolean;
  setShowDeleteConfirm: (value: boolean) => void;
  performRemoveStat: () => void;
  showPartOfBackgroundsConfirm: boolean;
  setShowPartOfBackgroundsConfirm: (value: boolean) => void;
  handleConfirmPartOfBackgroundsChange: () => void;
  handleCancelPartOfBackgroundsChange: () => void;
  pendingPartOfBackgroundsValue: boolean | null;
}

export const useStatEditor = ({
  stat,
  index,
  type,
  onUpdateStat,
  onRemoveStat,
  setEditingStats,
  readOnly = false,
}: UseStatEditorProps): UseStatEditorResult => {
  const [localStat, setLocalStat] = useState<Stat>(stat);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showPartOfBackgroundsConfirm, setShowPartOfBackgroundsConfirm] =
    useState(false);
  const [pendingPartOfBackgroundsValue, setPendingPartOfBackgroundsValue] =
    useState<boolean | null>(null);

  // Update local state when prop changes
  useEffect(() => {
    setLocalStat(stat);
  }, [stat]);

  const handleSave = () => {
    if (readOnly) return;

    if (
      localStat.name &&
      localStat.id.startsWith(type === "shared" ? "shared_" : "player_")
    ) {
      // Update the stat with all properties including initialValue
      onUpdateStat(type, index, localStat);

      // Exit edit mode
      setEditingStats((prev) => {
        const next = new Set(prev);
        next.delete(stat.id);
        return next;
      });
    }
  };

  const updateStatField = <K extends keyof Stat>(field: K, value: Stat[K]) => {
    if (readOnly) return;

    // If changing partOfPlayerBackgrounds for a player stat, show confirmation dialog
    if (
      type === "player" &&
      field === ("partOfPlayerBackgrounds" as K) &&
      value !== localStat[field]
    ) {
      setPendingPartOfBackgroundsValue(value as boolean);
      setShowPartOfBackgroundsConfirm(true);
      return;
    }

    setLocalStat((prev) => ({ ...prev, [field]: value }));
  };

  const handleConfirmPartOfBackgroundsChange = () => {
    if (pendingPartOfBackgroundsValue === null) return;

    console.log(
      `Confirmed change of partOfPlayerBackgrounds to ${pendingPartOfBackgroundsValue}`
    );
    setLocalStat((prev) => ({
      ...prev,
      partOfPlayerBackgrounds: pendingPartOfBackgroundsValue,
    }));
    setShowPartOfBackgroundsConfirm(false);
    setPendingPartOfBackgroundsValue(null);
  };

  const handleCancelPartOfBackgroundsChange = () => {
    setShowPartOfBackgroundsConfirm(false);
    setPendingPartOfBackgroundsValue(null);
  };

  const updateArrayField = <K extends keyof Stat>(
    field: K,
    index: number,
    value: string
  ) => {
    if (readOnly) return;
    setLocalStat((prev) => {
      const array = [...(prev[field] as string[])];
      array[index] = value;
      return { ...prev, [field]: array };
    });
  };

  const removeArrayItem = <K extends keyof Stat>(field: K, index: number) => {
    if (readOnly) return;
    setLocalStat((prev) => {
      const array = (prev[field] as string[]).filter((_, i) => i !== index);
      return { ...prev, [field]: array };
    });
  };

  const addArrayItem = <K extends keyof Stat>(field: K) => {
    if (readOnly) return;
    setLocalStat((prev) => {
      const array = [...(prev[field] as string[]), ""];
      return { ...prev, [field]: array };
    });
  };

  const handleRemoveStat = () => {
    // For player stats, show confirmation dialog before deletion
    if (type === "player") {
      console.log(
        `Showing delete confirmation for player stat: ${localStat.name} (type=${type})`
      );
      setShowDeleteConfirm(true);
      return;
    }

    // For shared stats, delete directly
    console.log(
      `Directly deleting shared stat: ${localStat.name} (type=${type})`
    );
    performRemoveStat();
  };

  const performRemoveStat = () => {
    console.log(`Performing stat removal for ${localStat.name}`);
    onRemoveStat(type, index);
    setEditingStats((prev) => {
      const next = new Set(prev);
      next.delete(stat.id);
      return next;
    });
  };

  const handleClose = () => {
    // Just close the editor without saving changes
    setEditingStats((prev) => {
      const next = new Set(prev);
      next.delete(stat.id);
      return next;
    });
  };

  return {
    localStat,
    handleSave,
    updateStatField,
    updateArrayField,
    removeArrayItem,
    addArrayItem,
    handleRemoveStat,
    handleClose,
    readOnly,
    showDeleteConfirm,
    setShowDeleteConfirm,
    performRemoveStat,
    showPartOfBackgroundsConfirm,
    setShowPartOfBackgroundsConfirm,
    handleConfirmPartOfBackgroundsChange,
    handleCancelPartOfBackgroundsChange,
    pendingPartOfBackgroundsValue,
  };
};
