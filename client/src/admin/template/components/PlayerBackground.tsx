import React from "react";
import { StatValueInput } from "./";
import { InfoIcon, Input } from "@components/ui";
import { ExpandableItem } from "@components";
import { CharacterBackground, Stat } from "@core/types";

interface PlayerBackgroundProps {
  background: CharacterBackground;
  index: number;
  editingBackgrounds: Set<string>;
  setEditingBackgrounds: (updater: (prev: Set<string>) => Set<string>) => void;
  onDelete: (index: number) => void;
  onUpdate: (index: number, updatedBackground: CharacterBackground) => void;
  playerStats: Stat[];
}

export const PlayerBackground: React.FC<PlayerBackgroundProps> = ({
  background,
  index,
  editingBackgrounds,
  setEditingBackgrounds,
  onDelete,
  onUpdate,
  playerStats,
}) => {
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
          />
        </div>

        <div className="space-y-3 mt-4">
          <div className="flex items-center">
            <h5 className="font-semibold">Initial Stat Values</h5>
            <InfoIcon
              tooltipText="Starting stat values for characters with this background"
              position="right"
              className="ml-2 mt-0"
            />
          </div>
          {data.initialPlayerStatValues.map((statValue, statIndex) => {
            const stat = playerStats.find((s) => s.id === statValue.statId);
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
    />
  );
};
