import { useState } from "react";

interface StatGroup {
  id: string;
  name: string;
}

interface StatItem {
  id: string;
  name: string;
  group: string;
}

interface UseStatGroupEditorResult {
  // State
  groups: StatGroup[];
  editingGroups: Set<string>;
  setEditingGroups: (callback: (prev: Set<string>) => Set<string>) => void;

  // Actions
  handleAddGroup: () => void;
  handleUpdateGroup: (index: number, updatedGroup: StatGroup) => void;
  handleRemoveGroup: (index: number) => void;

  // Helpers
  getStatsForGroup: (groupName: string) => StatItem[];
}

export function useStatGroupEditor(
  statGroups: string[],
  onChange: (updatedGroups: string[]) => void,
  sharedStats: StatItem[] = [],
  playerStats: StatItem[] = [],
  readOnly: boolean = false
): UseStatGroupEditorResult {
  const [editingGroups, setEditingGroups] = useState<Set<string>>(new Set());

  // Convert string[] to StatGroup[] with unique IDs
  const groups: StatGroup[] = statGroups.map((name, index) => ({
    id: `group_${index}`,
    name,
  }));

  const handleAddGroup = () => {
    if (readOnly) return;

    const newGroup = { id: `group_${Date.now()}`, name: "" };
    const newId = newGroup.id;

    // Add to editing set
    setEditingGroups((prev) => new Set(prev).add(newId));

    // Add empty group to the list
    onChange([...statGroups, ""]);
  };

  const handleUpdateGroup = (index: number, updatedGroup: StatGroup) => {
    if (readOnly) return;

    const updatedGroups = [...statGroups];
    updatedGroups[index] = updatedGroup.name;
    onChange(updatedGroups);
  };

  const handleRemoveGroup = (index: number) => {
    if (readOnly) return;

    const updated = statGroups.filter((_, i) => i !== index);
    onChange(updated);
  };

  // Get stats for a specific group
  const getStatsForGroup = (groupName: string) => {
    const stats = [...sharedStats, ...playerStats].filter(
      (stat) => stat.group === groupName
    );
    return stats;
  };

  return {
    // State
    groups,
    editingGroups,
    setEditingGroups,

    // Actions
    handleAddGroup,
    handleUpdateGroup,
    handleRemoveGroup,

    // Helpers
    getStatsForGroup,
  };
}
