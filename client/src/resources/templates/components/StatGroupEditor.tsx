import React from "react";
import { InfoIcon, PrimaryButton, Icons, Input } from "components/ui";
import { ExpandableItem } from "components";
import { useStatGroupEditor } from "../hooks/useStatGroupEditor";

interface StatGroupEditorProps {
  statGroups: string[];
  onChange: (updatedGroups: string[]) => void;
  sharedStats?: { id: string; name: string; group: string }[];
  playerStats?: { id: string; name: string; group: string }[];
  readOnly?: boolean;
}

interface StatGroup {
  id: string;
  name: string;
}

export const StatGroupEditor: React.FC<StatGroupEditorProps> = ({
  statGroups,
  onChange,
  sharedStats = [],
  playerStats = [],
  readOnly = false,
}) => {
  const {
    groups,
    editingGroups,
    setEditingGroups,
    handleAddGroup,
    handleUpdateGroup,
    handleRemoveGroup,
    getStatsForGroup,
  } = useStatGroupEditor(
    statGroups,
    onChange,
    sharedStats,
    playerStats,
    readOnly
  );

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
          disabled={readOnly}
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
            tooltipText="Categories to organize stats in the game's user interface"
            position="right"
            className="ml-2"
          />
        </div>
        {!readOnly && (
          <PrimaryButton
            variant="outline"
            leftBorder={false}
            size="sm"
            onClick={handleAddGroup}
            leftIcon={<Icons.Plus className="h-4 w-4" />}
          ></PrimaryButton>
        )}
      </div>

      {groups.length === 0 ? (
        <p className="text-gray-500">Add at least one stat group</p>
      ) : (
        <div className="space-y-4">
          {groups.map((group, index) => (
            <ExpandableItem
              key={group.id}
              id={group.id}
              title={
                <div>
                  <span>{group.name || `Group ${index + 1}`}</span>
                  {group.name && (
                    <div className="text-sm text-gray-500 mt-1">
                      {getStatsForGroup(group.name)
                        .map((stat) => stat.name)
                        .join(", ")}
                    </div>
                  )}
                </div>
              }
              data={group}
              editingSet={editingGroups}
              setEditing={setEditingGroups}
              onDelete={() => handleRemoveGroup(index)}
              onSave={(updatedGroup) => handleUpdateGroup(index, updatedGroup)}
              renderEditForm={renderGroupForm}
              isSaveDisabled={(group) => !group.name}
              readOnly={readOnly}
            />
          ))}
        </div>
      )}
    </section>
  );
};
