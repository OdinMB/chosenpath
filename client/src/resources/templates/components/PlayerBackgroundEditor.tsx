import React from "react";
import { StatValueInput } from ".";
import { InfoIcon, Input } from "components/ui";
import { ExpandableItem } from "components";
import { CharacterBackground, Stat } from "core/types";

interface PlayerBackgroundEditorProps {
  background: CharacterBackground;
  index: number;
  editingBackgrounds: Set<string>;
  setEditingBackgrounds: (updater: (prev: Set<string>) => Set<string>) => void;
  onDelete: (index: number) => void;
  onUpdate: (index: number, updatedBackground: CharacterBackground) => void;
  playerStats: Stat[];
  readOnly?: boolean;
}

export const PlayerBackgroundEditor: React.FC<PlayerBackgroundEditorProps> = ({
  background,
  index,
  editingBackgrounds,
  setEditingBackgrounds,
  onDelete,
  onUpdate,
  playerStats,
  readOnly = false,
}) => {
  // Filter player stats to only include those marked as part of player backgrounds
  const eligiblePlayerStats = playerStats.filter(
    (stat) => stat.partOfPlayerBackgrounds !== false
  );

  // Filter background initialPlayerStatValues to only include eligible stats
  React.useEffect(() => {
    // Skip if in read-only mode
    if (readOnly) return;

    // Filter out stat values for stats that shouldn't be part of backgrounds
    const eligibleStatIds = eligiblePlayerStats.map((stat) => stat.id);
    const filteredStatValues = background.initialPlayerStatValues.filter(
      (statValue) => eligibleStatIds.includes(statValue.statId)
    );

    // If values were removed, update the background
    if (
      filteredStatValues.length !== background.initialPlayerStatValues.length
    ) {
      onUpdate(index, {
        ...background,
        initialPlayerStatValues: filteredStatValues,
      });
    }
  }, [background, eligiblePlayerStats, index, onUpdate, readOnly]);

  const renderBackgroundForm = (
    data: CharacterBackground,
    onChange: (updatedData: CharacterBackground) => void
  ) => {
    return (
      <div className="flex-1 space-y-4">
        <div className="flex items-center gap-2">
          <span className="font-semibold w-36">Title</span>
          <Input
            className="flex-1"
            value={data.title}
            onChange={(e) => onChange({ ...data, title: e.target.value })}
            placeholder="Background title"
            disabled={readOnly}
          />
        </div>

        <div className="flex items-start gap-2">
          <span className="font-semibold w-36 pt-2">Description</span>
          <textarea
            className="w-full p-2 border rounded flex-1"
            rows={3}
            value={data.fluffTemplate}
            onChange={(e) =>
              onChange({ ...data, fluffTemplate: e.target.value })
            }
            placeholder="Background description with placeholders: {name}, {personal}, {object}, {possessive}, {reflexive}"
            disabled={readOnly}
          />
        </div>

        <div className="space-y-3 mt-4">
          <div className="flex items-center">
            <h5 className="font-semibold">Initial Stat Values</h5>
            <InfoIcon
              tooltipText="Starting stat values for characters with this background"
              position="right"
              className="ml-2 mt-1"
            />
          </div>
          {data.initialPlayerStatValues.map((statValue, statIndex) => {
            const stat = eligiblePlayerStats.find(
              (s) => s.id === statValue.statId
            );
            if (!stat) return null;

            return (
              <div key={statValue.statId} className="flex gap-2 items-center">
                <StatValueInput
                  value={statValue.value}
                  onChange={(newValue) => {
                    const updated = {
                      ...data,
                      initialPlayerStatValues: data.initialPlayerStatValues.map(
                        (v, i) =>
                          i === statIndex ? { ...v, value: newValue } : v
                      ),
                    };
                    onChange(updated);
                  }}
                  statType={stat.type}
                  placeholder={`Initial ${stat.name}`}
                  className="flex-1"
                  label={stat.name}
                  disabled={readOnly}
                />
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <ExpandableItem
      id={`background_${index}`}
      title={background.title || `Background ${index + 1}`}
      data={background}
      editingSet={editingBackgrounds}
      setEditing={setEditingBackgrounds}
      onDelete={() => onDelete(index)}
      onSave={(updatedBackground) => onUpdate(index, updatedBackground)}
      renderEditForm={renderBackgroundForm}
      isSaveDisabled={() => false}
      readOnly={readOnly}
    />
  );
};
