import React from "react";
import { PrimaryButton, Icons, Input, Checkbox } from "components/ui";
import { ArrayField } from "components";
import { Stat } from "core/types";
import { StatValueInput } from "./StatValueInput";
import { useStatEditor } from "../hooks/useStatEditor";
import { ConfirmDialog } from "components/ui/ConfirmDialog";

interface StatEditorProps {
  stat: Stat;
  index: number;
  type: "shared" | "player";
  statGroups: string[];
  onUpdateStat: (
    type: "shared" | "player",
    index: number,
    updates: Partial<Stat>
  ) => void;
  onRemoveStat: (type: "shared" | "player", index: number) => void;
  setEditingStats: (updater: (prev: Set<string>) => Set<string>) => void;
  readOnly?: boolean;
}

export const StatEditor: React.FC<StatEditorProps> = ({
  stat,
  index,
  type,
  statGroups,
  onUpdateStat,
  onRemoveStat,
  setEditingStats,
  readOnly = false,
}) => {
  const {
    localStat,
    handleSave,
    updateStatField,
    handleRemoveStat,
    handleClose,
    showDeleteConfirm,
    setShowDeleteConfirm,
    performRemoveStat,
    showPartOfBackgroundsConfirm,
    handleConfirmPartOfBackgroundsChange,
    handleCancelPartOfBackgroundsChange,
    pendingPartOfBackgroundsValue,
  } = useStatEditor({
    stat,
    index,
    type,
    onUpdateStat,
    onRemoveStat,
    setEditingStats,
    readOnly,
  });

  return (
    <div className="bg-white p-4 rounded-lg shadow mb-4">
      <div className="flex justify-between items-start mb-4">
        <div className="flex-1 space-y-4 mr-4">
          <div className="flex items-center gap-2">
            <span className="font-semibold w-24">Name</span>
            <Input
              id={`stat-name-${stat.id}`}
              name={`stat-name-${stat.id}`}
              className="flex-1"
              value={localStat.name}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                updateStatField("name", e.target.value)
              }
              placeholder="Enter stat name"
              disabled={readOnly}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="font-semibold w-24">ID</span>
            <div className="flex flex-1">
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
                  updateStatField("id", newId);
                }}
                placeholder="Enter stat ID"
                disabled={readOnly}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-semibold w-24">Description</span>
            <Input
              id={`stat-description-${stat.id}`}
              name={`stat-description-${stat.id}`}
              className="flex-1"
              value={localStat.tooltip}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                updateStatField("tooltip", e.target.value)
              }
              placeholder="Enter stat description"
              disabled={readOnly}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="font-semibold w-24">Group</span>
            <select
              id={`stat-group-${stat.id}`}
              name={`stat-group-${stat.id}`}
              className="flex-1 p-2 border rounded"
              value={localStat.group}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                updateStatField("group", e.target.value)
              }
              disabled={readOnly}
            >
              {statGroups.map((group, i) => (
                <option key={i} value={group}>
                  {group}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-semibold w-24">Type</span>
            <select
              id={`stat-type-${stat.id}`}
              name={`stat-type-${stat.id}`}
              className="flex-1 p-2 border rounded"
              value={localStat.type}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                const newType = e.target.value as Stat["type"];
                updateStatField("type", newType);
                // Reset initial value based on type
                if (
                  type === "shared" ||
                  (type === "player" &&
                    localStat.partOfPlayerBackgrounds === false)
                ) {
                  if (newType === "string") {
                    updateStatField("initialValue", "");
                  } else if (newType === "string[]") {
                    updateStatField("initialValue", []);
                  } else {
                    updateStatField("initialValue", 50);
                  }
                }
              }}
              disabled={readOnly}
            >
              <option value="percentage">Percentage</option>
              <option value="number">Number</option>
              <option value="string">String</option>
              <option value="string[]">String List</option>
              <option value="opposites">Opposites</option>
            </select>
          </div>

          {(type === "shared" ||
            (type === "player" &&
              localStat.partOfPlayerBackgrounds === false)) && (
            <div className="flex items-center gap-2">
              <StatValueInput
                statType={localStat.type}
                value={
                  localStat.initialValue ||
                  (localStat.type === "string"
                    ? ""
                    : localStat.type === "string[]"
                    ? []
                    : 50)
                }
                onChange={(value) => updateStatField("initialValue", value)}
                placeholder="Enter initial value"
                className="flex-1"
                label="Initial Value"
                disabled={readOnly}
              />
            </div>
          )}
          {/* Additional stat fields */}
          {(localStat.type === "string" || localStat.type === "string[]") && (
            <div className="flex items-center gap-2">
              <span className="font-semibold w-40">Possible Values</span>
              <Input
                id={`stat-possible-values-${stat.id}`}
                name={`stat-possible-values-${stat.id}`}
                className="flex-1"
                value={localStat.possibleValues}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  updateStatField("possibleValues", e.target.value)
                }
                placeholder={
                  localStat.type === "string"
                    ? "e.g., Novice, Apprentice, Master"
                    : "e.g., only minor spells, (max 4 items)"
                }
                disabled={readOnly}
              />
            </div>
          )}
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Checkbox
                id={`stat-visible-${stat.id}`}
                name={`stat-visible-${stat.id}`}
                checked={localStat.isVisible}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  updateStatField("isVisible", e.target.checked)
                }
                disabled={readOnly}
              />
              <label
                htmlFor={`stat-visible-${stat.id}`}
                className="font-semibold"
              >
                Visible to players
              </label>
            </div>

            {type === "player" && (
              <div className="flex items-center gap-2">
                <Checkbox
                  id={`stat-background-${stat.id}`}
                  name={`stat-background-${stat.id}`}
                  checked={
                    localStat.partOfPlayerBackgrounds !== false ? true : false
                  }
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    updateStatField("partOfPlayerBackgrounds", e.target.checked)
                  }
                  disabled={readOnly}
                />
                <label
                  htmlFor={`stat-background-${stat.id}`}
                  className="font-semibold"
                >
                  Part of player backgrounds
                </label>
              </div>
            )}

            <ArrayField
              title="Narrative Implications"
              tooltipText="How this stat affects the story narrative"
              items={localStat.narrativeImplications}
              onChange={(items: string[]) =>
                updateStatField("narrativeImplications", items)
              }
              placeholder="e.g., Below 30% causes visible weakness"
              emptyPlaceholder="Click + to add narrative implications"
              readOnly={readOnly}
            />

            <ArrayField
              title="Effect on Points"
              tooltipText="How this stat affects point calculations"
              items={localStat.effectOnPoints}
              onChange={(items: string[]) =>
                updateStatField("effectOnPoints", items)
              }
              placeholder="e.g., Above 70% provides +15 points to social challenges"
              emptyPlaceholder="Click + to add effects"
              readOnly={readOnly}
            />

            <div className="flex items-center gap-2">
              <span className="font-semibold w-48">Sacrifice Options</span>
              <Input
                id={`stat-sacrifice-options-${stat.id}`}
                name={`stat-sacrifice-options-${stat.id}`}
                className="flex-1"
                value={localStat.optionsToSacrifice}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  updateStatField("optionsToSacrifice", e.target.value)
                }
                placeholder="How can this stat be sacrificed for bonuses?"
                disabled={readOnly}
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold w-48">Reward Options</span>
              <Input
                id={`stat-reward-options-${stat.id}`}
                name={`stat-reward-options-${stat.id}`}
                className="flex-1"
                value={localStat.optionsToGainAsReward}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  updateStatField("optionsToGainAsReward", e.target.value)
                }
                placeholder="How can this stat be gained as a reward?"
                disabled={readOnly}
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id={`stat-beat-changes-${stat.id}`}
                name={`stat-beat-changes-${stat.id}`}
                checked={localStat.canBeChangedInBeatResolutions}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  updateStatField(
                    "canBeChangedInBeatResolutions",
                    e.target.checked
                  )
                }
                disabled={readOnly}
              />
              <label
                htmlFor={`stat-beat-changes-${stat.id}`}
                className="font-semibold"
              >
                Can be changed in beat resolutions
              </label>
            </div>

            <ArrayField
              title="Adjustments After Threads"
              tooltipText="How this stat changes after completing story threads"
              items={localStat.adjustmentsAfterThreads}
              onChange={(items: string[]) =>
                updateStatField("adjustmentsAfterThreads", items)
              }
              placeholder="e.g., Mana regenerates by 10% after each thread"
              emptyPlaceholder="Click + to add thread adjustments"
              readOnly={readOnly}
            />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          {readOnly && (
            <button
              onClick={handleClose}
              className="text-secondary hover:text-secondary-700"
              aria-label={`Collapse ${stat.name}`}
              title="Collapse details"
            >
              <Icons.ChevronUp className="h-5 w-5" />
            </button>
          )}
          {!readOnly && (
            <button
              onClick={() => {
                console.log(
                  `Delete button clicked for ${localStat.name} (type=${type})`
                );
                handleRemoveStat();
              }}
              className="text-tertiary hover:text-tertiary-700"
              aria-label="Remove stat"
            >
              <Icons.Trash className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <PrimaryButton
          onClick={handleClose}
          variant="outline"
          leftBorder={false}
        >
          Close
        </PrimaryButton>
        {!readOnly && (
          <PrimaryButton
            onClick={handleSave}
            disabled={!localStat.name}
            variant="outline"
          >
            Save
          </PrimaryButton>
        )}
      </div>

      {/* Confirmation Dialog for Player Stat Deletion */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => {
          console.log("Closing delete confirmation dialog");
          setShowDeleteConfirm(false);
        }}
        onConfirm={() => {
          console.log("Confirmed deletion");
          performRemoveStat();
          setShowDeleteConfirm(false);
        }}
        title={`Delete ${localStat.name}`}
        message={`This will remove the stat ${localStat.name} from all character backgrounds. This cannot be undone. Do you want to continue?`}
        confirmText="Delete"
        cancelText="Cancel"
      />

      {/* Confirmation Dialog for Part of Backgrounds Change */}
      <ConfirmDialog
        isOpen={showPartOfBackgroundsConfirm}
        onClose={handleCancelPartOfBackgroundsChange}
        onConfirm={handleConfirmPartOfBackgroundsChange}
        title={pendingPartOfBackgroundsValue ? `Add to Backgrounds` : `Remove from Backgrounds`}
        message={
          pendingPartOfBackgroundsValue
            ? `Adding "${localStat.name}" to character backgrounds will:
            
• Add this stat to ALL character backgrounds
• Use preserved values if available, otherwise default values
• Allow different starting values per background
• This stat will no longer use a universal initial value

This change can be reversed later.`
            : `Removing "${localStat.name}" from character backgrounds will:
            
• Remove this stat from ALL character backgrounds  
• Switch to using a universal initial value for all players
• Preserve your current initial value if set
• Any background-specific values will be lost permanently

⚠️ Background-specific values cannot be recovered once removed.`
        }
        confirmText={pendingPartOfBackgroundsValue ? "Add to Backgrounds" : "Remove from Backgrounds"}
        cancelText="Cancel"
      />
    </div>
  );
};
