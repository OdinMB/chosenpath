import React from "react";
import { InfoIcon, PrimaryButton, Icons, Input } from "@components/ui";

interface StatGroupsProps {
  statGroups: string[];
  onChange: (updatedGroups: string[]) => void;
}

export const StatGroups: React.FC<StatGroupsProps> = ({
  statGroups,
  onChange,
}) => {
  const handleRemoveGroup = (index: number) => {
    const updated = statGroups.filter((_, i) => i !== index);
    onChange(updated);
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
          onClick={() => {
            onChange([...statGroups, ""]);
          }}
          leftIcon={<Icons.Plus className="h-4 w-4" />}
        ></PrimaryButton>
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
                  onChange(updated);
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
  );
};
