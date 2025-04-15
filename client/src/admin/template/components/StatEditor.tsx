import React from "react";
import { InfoIcon, PrimaryButton, Icons, Input } from "@components/ui";
import { Stat, StatValueEntry } from "@core/types";
import { StatValueInput } from "./StatValueInput";
import { useStatEditor } from "../hooks/useStatEditor";

interface StatEditorProps {
  stat: Stat;
  index: number;
  type: "shared" | "player";
  statGroups: string[];
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

export const StatEditor: React.FC<StatEditorProps> = ({
  stat,
  index,
  type,
  statGroups,
  initialValue,
  onUpdateInitialValue,
  onUpdateStat,
  onRemoveStat,
  setEditingStats,
}) => {
  const {
    localStat,
    localInitialValue,
    setLocalInitialValue,
    handleSave,
    updateStatField,
    updateArrayField,
    removeArrayItem,
    addArrayItem,
  } = useStatEditor({
    stat,
    index,
    type,
    initialValue,
    onUpdateInitialValue,
    onUpdateStat,
    onRemoveStat,
    setEditingStats,
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
                if (type === "shared") {
                  if (newType === "string") {
                    setLocalInitialValue("");
                  } else if (newType === "string[]") {
                    setLocalInitialValue([]);
                  } else {
                    setLocalInitialValue(50);
                  }
                }
              }}
            >
              <option value="percentage">Percentage</option>
              <option value="number">Number</option>
              <option value="string">String</option>
              <option value="string[]">String List</option>
              <option value="opposites">Opposites</option>
            </select>
          </div>

          {type === "shared" && (
            <div className="flex items-center gap-2">
              <StatValueInput
                statType={localStat.type}
                value={localInitialValue}
                onChange={(value) => setLocalInitialValue(value)}
                placeholder="Enter initial value"
                className="flex-1"
                label="Initial Value"
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
              />
            </div>
          )}
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id={`stat-visible-${stat.id}`}
                name={`stat-visible-${stat.id}`}
                checked={localStat.isVisible}
                onChange={(e) => updateStatField("isVisible", e.target.checked)}
              />
              <label
                htmlFor={`stat-visible-${stat.id}`}
                className="font-semibold"
              >
                Visible to players
              </label>
            </div>
            <div>
              <div className="flex justify-between items-center mb-1">
                <div className="flex items-center">
                  <h3 className="font-semibold">Narrative Implications</h3>
                  <InfoIcon
                    tooltipText="How this stat affects the story narrative"
                    position="right"
                    className="ml-2 mt-1"
                  />
                </div>
                <PrimaryButton
                  variant="outline"
                  size="sm"
                  onClick={() => addArrayItem("narrativeImplications")}
                  leftIcon={<Icons.Plus className="h-4 w-4" />}
                >
                  Add
                </PrimaryButton>
              </div>
              {localStat.narrativeImplications.length === 0 ? (
                <Input
                  id={`new-implication-${stat.id}`}
                  name={`new-implication-${stat.id}`}
                  placeholder="Click + to add narrative implications"
                  disabled
                />
              ) : (
                localStat.narrativeImplications.map((implication, idx) => (
                  <div key={idx} className="flex gap-2 mb-2">
                    <Input
                      id={`stat-implication-${stat.id}-${idx}`}
                      name={`stat-implication-${stat.id}-${idx}`}
                      className="flex-1"
                      value={implication}
                      onChange={(e) =>
                        updateArrayField(
                          "narrativeImplications",
                          idx,
                          e.target.value
                        )
                      }
                      placeholder="e.g., Below 30% causes visible weakness"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        removeArrayItem("narrativeImplications", idx)
                      }
                      className="text-tertiary hover:text-tertiary-700"
                      aria-label={`Remove implication ${idx + 1}`}
                    >
                      <Icons.Trash className="h-4 w-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
            <div>
              <div className="flex justify-between items-center mb-1">
                <div className="flex items-center">
                  <h3 className="font-semibold">Effect on Points</h3>
                  <InfoIcon
                    tooltipText="How this stat affects point calculations"
                    position="right"
                    className="ml-2 mt-1"
                  />
                </div>
                <PrimaryButton
                  variant="outline"
                  size="sm"
                  onClick={() => addArrayItem("effectOnPoints")}
                  leftIcon={<Icons.Plus className="h-4 w-4" />}
                >
                  Add
                </PrimaryButton>
              </div>
              {localStat.effectOnPoints.length === 0 ? (
                <Input
                  id={`new-effect-${stat.id}`}
                  name={`new-effect-${stat.id}`}
                  placeholder="Click + to add effects"
                  disabled
                />
              ) : (
                localStat.effectOnPoints.map((effect, idx) => (
                  <div key={idx} className="flex gap-2 mb-2">
                    <Input
                      id={`stat-effect-${stat.id}-${idx}`}
                      name={`stat-effect-${stat.id}-${idx}`}
                      className="flex-1"
                      value={effect}
                      onChange={(e) =>
                        updateArrayField("effectOnPoints", idx, e.target.value)
                      }
                      placeholder="e.g., Above 70% provides +15 points to social challenges"
                    />
                    <button
                      type="button"
                      onClick={() => removeArrayItem("effectOnPoints", idx)}
                      className="text-tertiary hover:text-tertiary-700"
                      aria-label={`Remove effect ${idx + 1}`}
                    >
                      <Icons.Trash className="h-4 w-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
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
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id={`stat-beat-changes-${stat.id}`}
                name={`stat-beat-changes-${stat.id}`}
                checked={localStat.canBeChangedInBeatResolutions}
                onChange={(e) =>
                  updateStatField(
                    "canBeChangedInBeatResolutions",
                    e.target.checked
                  )
                }
              />
              <label
                htmlFor={`stat-beat-changes-${stat.id}`}
                className="font-semibold"
              >
                Can be changed in beat resolutions
              </label>
            </div>
            <div>
              <div className="flex justify-between items-center mb-1">
                <div className="flex items-center">
                  <h3 className="font-semibold">Adjustments After Threads</h3>
                  <InfoIcon
                    tooltipText="How this stat changes after completing story threads"
                    position="right"
                    className="ml-2 mt-1"
                  />
                </div>
                <PrimaryButton
                  variant="outline"
                  size="sm"
                  onClick={() => addArrayItem("adjustmentsAfterThreads")}
                  leftIcon={<Icons.Plus className="h-4 w-4" />}
                >
                  Add
                </PrimaryButton>
              </div>
              {localStat.adjustmentsAfterThreads.length === 0 ? (
                <Input
                  id={`new-adjustment-${stat.id}`}
                  name={`new-adjustment-${stat.id}`}
                  placeholder="Click + to add thread adjustments"
                  disabled
                />
              ) : (
                localStat.adjustmentsAfterThreads.map((adjustment, idx) => (
                  <div key={idx} className="flex gap-2 mb-2">
                    <Input
                      id={`stat-adjustment-${stat.id}-${idx}`}
                      name={`stat-adjustment-${stat.id}-${idx}`}
                      className="flex-1"
                      value={adjustment}
                      onChange={(e) =>
                        updateArrayField(
                          "adjustmentsAfterThreads",
                          idx,
                          e.target.value
                        )
                      }
                      placeholder="e.g., Mana regenerates by 10% after each thread"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        removeArrayItem("adjustmentsAfterThreads", idx)
                      }
                      className="text-tertiary hover:text-tertiary-700"
                      aria-label={`Remove adjustment ${idx + 1}`}
                    >
                      <Icons.Trash className="h-4 w-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <button
            onClick={() => onRemoveStat(type, index)}
            className="text-tertiary hover:text-tertiary-700"
            aria-label="Remove stat"
          >
            <Icons.Trash className="h-5 w-5" />
          </button>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <PrimaryButton
          onClick={handleSave}
          disabled={!localStat.name}
          variant="outline"
        >
          Save
        </PrimaryButton>
      </div>
    </div>
  );
};
