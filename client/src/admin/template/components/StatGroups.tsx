import React, { useState } from "react";
import { InfoIcon, PrimaryButton, Icons, Input } from "@components/ui";
import { ExpandableItem } from "./ExpandableItem";

interface StatGroupsProps {
  statGroups: string[];
  onChange: (updatedGroups: string[]) => void;
}

interface StatGroup {
  id: string;
  name: string;
}

export const StatGroups: React.FC<StatGroupsProps> = ({
  statGroups,
  onChange,
}) => {
  const [editingGroups, setEditingGroups] = useState<Set<string>>(new Set());

  // Convert string[] to StatGroup[] with unique IDs
  const groups: StatGroup[] = statGroups.map((name, index) => ({
    id: `group_${index}`,
    name,
  }));

  const handleAddGroup = () => {
    const newGroup = { id: `group_${Date.now()}`, name: "" };
    const newId = newGroup.id;

    // Add to editing set
    setEditingGroups((prev) => new Set(prev).add(newId));

    // Add empty group to the list
    onChange([...statGroups, ""]);
  };

  const handleUpdateGroup = (index: number, updatedGroup: StatGroup) => {
    const updatedGroups = [...statGroups];
    updatedGroups[index] = updatedGroup.name;
    onChange(updatedGroups);
  };

  const handleRemoveGroup = (index: number) => {
    const updated = statGroups.filter((_, i) => i !== index);
    onChange(updated);
  };

  const renderGroupForm = (
    group: StatGroup,
    onFormChange: (updatedGroup: StatGroup) => void
  ) => {
    return (
      <div className="flex gap-2">
        <Input
          id={`stat-group-${group.id}`}
          name={`stat-group-${group.id}`}
          value={group.name}
          onChange={(e) => onFormChange({ ...group, name: e.target.value })}
          placeholder="Enter group name"
          className="flex-1"
        />
      </div>
    );
  };

  return (
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
          leftBorder={false}
          size="sm"
          onClick={handleAddGroup}
          leftIcon={<Icons.Plus className="h-4 w-4" />}
        ></PrimaryButton>
      </div>

      {groups.length === 0 ? (
        <p className="text-gray-500">Add at least one stat group</p>
      ) : (
        <div className="space-y-2">
          {groups.map((group, index) => (
            <ExpandableItem
              key={group.id}
              id={group.id}
              title={group.name || `Group ${index + 1}`}
              data={group}
              editingSet={editingGroups}
              setEditing={setEditingGroups}
              onDelete={() => handleRemoveGroup(index)}
              onSave={(updatedGroup) => handleUpdateGroup(index, updatedGroup)}
              renderEditForm={renderGroupForm}
              isSaveDisabled={(group) => !group.name}
            />
          ))}
        </div>
      )}
    </section>
  );
};
