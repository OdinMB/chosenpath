import React from "react";
import { Outcome, ExplorationResolution, ResolutionType } from "@core/types";
import { ExpandableItem } from "@components";
import { InfoIcon, Input, Select } from "@components/ui";
import { useOutcomes } from "../hooks/useOutcomes";

interface ExpandableOutcomeProps {
  outcome: Outcome;
  index: number;
  editingOutcomes: Set<string>;
  setEditingOutcomes: (updater: (prev: Set<string>) => Set<string>) => void;
  onDelete: (index: number) => void;
  onUpdate: (index: number, updatedOutcome: Outcome) => void;
  readOnly?: boolean;
}

export const ExpandableOutcome: React.FC<ExpandableOutcomeProps> = ({
  outcome,
  index,
  editingOutcomes,
  setEditingOutcomes,
  onDelete,
  onUpdate,
  readOnly = false,
}) => {
  const {
    isChallenge,
    isExploration,
    handleResolutionTypeChange,
    handleResolutionFieldChange,
  } = useOutcomes([], undefined, readOnly);

  const renderOutcomeForm = (
    data: Outcome,
    onChange: (updatedData: Outcome) => void
  ) => {
    const resolutions = data.possibleResolutions as ResolutionType;

    return (
      <div className="flex-1 space-y-4">
        <div className="flex items-center gap-2">
          <span className="font-semibold w-36">Question</span>
          <Input
            className="flex-1"
            value={data.question}
            onChange={(e) => onChange({ ...data, question: e.target.value })}
            placeholder="Question that defines the outcome"
            disabled={readOnly}
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="font-semibold w-36">Resonance</span>
          <Input
            className="flex-1"
            value={data.resonance}
            onChange={(e) => onChange({ ...data, resonance: e.target.value })}
            placeholder="Why does this matter to the character or group?"
            disabled={readOnly}
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="font-semibold w-30">Milestones</span>
          <InfoIcon
            tooltipText="1 for side-outcomes, 2 as default, 3 for particularly important outcomes"
            position="right"
            className="ml-2 mt-1"
          />
          <Input
            type="number"
            min={1}
            max={3}
            className="max-w-16"
            value={data.intendedNumberOfMilestones}
            onChange={(e) =>
              onChange({
                ...data,
                intendedNumberOfMilestones: parseInt(e.target.value, 10),
              })
            }
            disabled={readOnly}
          />
        </div>

        <div>
          <div className="flex justify-between items-center mb-2">
            <div className="flex items-center">
              <h4 className="font-semibold">Possible Resolutions</h4>
              <InfoIcon
                tooltipText="Different ways this outcome could be resolved"
                position="right"
                className="ml-2 mt-1"
              />
            </div>
            {!readOnly && (
              <Select
                className="text-sm"
                size="sm"
                value={isExploration(resolutions) ? "exploration" : "challenge"}
                onChange={(e) => {
                  handleResolutionTypeChange(e.target.value, data, onChange);
                }}
              >
                <option value="challenge">Challenge</option>
                <option value="exploration">Exploration</option>
              </Select>
            )}
          </div>

          {isChallenge(resolutions) ? (
            // Challenge resolutions
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="font-semibold w-36">Favorable</span>
                <Input
                  className="flex-1"
                  value={resolutions.favorable}
                  onChange={(e) => {
                    handleResolutionFieldChange(
                      data,
                      "favorable",
                      e.target.value,
                      onChange
                    );
                  }}
                  placeholder="Resolution that is favorable to the player(s)"
                  disabled={readOnly}
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold w-36">Unfavorable</span>
                <Input
                  className="flex-1"
                  value={resolutions.unfavorable}
                  onChange={(e) => {
                    handleResolutionFieldChange(
                      data,
                      "unfavorable",
                      e.target.value,
                      onChange
                    );
                  }}
                  placeholder="Resolution that is unfavorable for the player(s)"
                  disabled={readOnly}
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold w-36">Mixed</span>
                <Input
                  className="flex-1"
                  value={resolutions.mixed}
                  onChange={(e) => {
                    handleResolutionFieldChange(
                      data,
                      "mixed",
                      e.target.value,
                      onChange
                    );
                  }}
                  placeholder="Resolution for a mixed outcome"
                  disabled={readOnly}
                />
              </div>
            </div>
          ) : (
            // Exploration resolutions
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="font-semibold w-36">Resolution 1</span>
                <Input
                  className="flex-1"
                  value={(resolutions as ExplorationResolution).resolution1}
                  onChange={(e) => {
                    handleResolutionFieldChange(
                      data,
                      "resolution1",
                      e.target.value,
                      onChange
                    );
                  }}
                  placeholder="First possible resolution"
                  disabled={readOnly}
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold w-36">Resolution 2</span>
                <Input
                  className="flex-1"
                  value={(resolutions as ExplorationResolution).resolution2}
                  onChange={(e) => {
                    handleResolutionFieldChange(
                      data,
                      "resolution2",
                      e.target.value,
                      onChange
                    );
                  }}
                  placeholder="Second possible resolution"
                  disabled={readOnly}
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold w-36">Resolution 3</span>
                <Input
                  className="flex-1"
                  value={(resolutions as ExplorationResolution).resolution3}
                  onChange={(e) => {
                    handleResolutionFieldChange(
                      data,
                      "resolution3",
                      e.target.value,
                      onChange
                    );
                  }}
                  placeholder="Third possible resolution"
                  disabled={readOnly}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <ExpandableItem
      id={outcome.id}
      title={outcome.question || `Outcome ${index + 1}`}
      data={outcome}
      editingSet={editingOutcomes}
      setEditing={setEditingOutcomes}
      onDelete={() => onDelete(index)}
      onSave={(updatedOutcome) => onUpdate(index, updatedOutcome)}
      renderEditForm={renderOutcomeForm}
      isSaveDisabled={(data) => !data.question}
      readOnly={readOnly}
    />
  );
};
