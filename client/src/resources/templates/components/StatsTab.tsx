import { useState, useEffect } from "react";
import { Stat, PlayerSlot, PlayerOptionsGeneration } from "core/types";
import { useStatEditorHelpers } from "../hooks/useStatEditor";
import { StatGroupEditor } from "./StatGroupEditor";
import { StatListSection } from "./StatListSection";

type StatsTabProps = {
  statGroups: string[];
  sharedStats: Stat[];
  playerStats: Stat[];
  playerOptions: Record<PlayerSlot, PlayerOptionsGeneration>;
  onChange?: (updates: {
    statGroups?: string[];
    sharedStats?: Stat[];
    playerStats?: Stat[];
    playerOptions?: Record<PlayerSlot, PlayerOptionsGeneration>;
  }) => void;
  readOnly?: boolean;
};

export const StatsTab = ({
  statGroups,
  sharedStats,
  playerStats,
  playerOptions,
  onChange,
  readOnly = false,
}: StatsTabProps) => {
  // Track which stats are being edited by their IDs
  const [editingStats, setEditingStats] = useState<Set<string>>(new Set());

  // Use the extracted helper functions
  const {
    handleAddStat,
    handleUpdateStat,
    handleRemoveStat,
    handleConvertStat,
    ensureBackgroundCompleteness,
  } = useStatEditorHelpers({
    statGroups,
    sharedStats,
    playerStats,
    playerOptions,
    editingStats,
    onChange,
    setEditingStats,
    readOnly,
  });

  // Automatically validate and fix background completeness when player stats change
  useEffect(() => {
    if (readOnly || !onChange) return;
    
    const validatedPlayerOptions = ensureBackgroundCompleteness(playerOptions, playerStats);
    if (validatedPlayerOptions !== playerOptions) {
      console.log("Auto-correcting background completeness");
      onChange({ playerOptions: validatedPlayerOptions });
    }
  }, [playerStats, playerOptions, ensureBackgroundCompleteness, onChange, readOnly]);

  const handleUpdateStatGroups = (updatedGroups: string[]) => {
    if (readOnly || !onChange) return;
    onChange({ statGroups: updatedGroups });
  };

  return (
    <div className="space-y-8">
      {/* Stat Groups */}
      <StatGroupEditor
        statGroups={statGroups}
        onChange={handleUpdateStatGroups}
        sharedStats={sharedStats}
        playerStats={playerStats}
        readOnly={readOnly}
      />

      {/* Shared Stats */}
      <StatListSection
        title="Shared Stats"
        tooltip="Stats shared by all players in the game"
        icon="Shared stats apply to all players"
        iconColor="bg-blue-500"
        stats={sharedStats}
        statGroups={statGroups}
        type="shared"
        editingStats={editingStats}
        onAddStat={handleAddStat}
        onUpdateStat={handleUpdateStat}
        onRemoveStat={handleRemoveStat}
        onConvertStat={handleConvertStat}
        setEditingStats={setEditingStats}
        readOnly={readOnly}
      />

      {/* Player Stats */}
      <StatListSection
        title="Player Stats"
        tooltip="Stats that are unique to each player"
        icon="Player stats are unique to each player"
        iconColor="bg-green-500"
        stats={playerStats}
        statGroups={statGroups}
        type="player"
        editingStats={editingStats}
        onAddStat={handleAddStat}
        onUpdateStat={handleUpdateStat}
        onRemoveStat={handleRemoveStat}
        onConvertStat={handleConvertStat}
        setEditingStats={setEditingStats}
        readOnly={readOnly}
      />
    </div>
  );
};
