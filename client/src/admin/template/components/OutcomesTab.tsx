import React from "react";
import { PrimaryButton, Icons, Input, Select } from "@components/ui";
import { Outcome, ExplorationResolution } from "@core/types";
import { ExpandableItem } from "./ExpandableItem";
import { useOutcomes } from "../hooks/useOutcomes";
import { useOutcomeForm } from "../hooks/useOutcomeForm";
import { InfoIcon } from "@components/ui";

interface OutcomesTabProps {
  outcomes: Outcome[];
  onChange: (outcomes: Outcome[]) => void;
}

export const OutcomesTab: React.FC<OutcomesTabProps> = ({
  outcomes,
  onChange,
}) => {
  const {
    editingOutcomes,
    setEditingOutcomes,
    handleAddOutcome,
    handleUpdateOutcome,
    handleRemoveOutcome,
  } = useOutcomes(outcomes, onChange);

  const { handleResolutionTypeChange, handleResolutionFieldChange } =
    useOutcomeForm();

  const renderOutcomeForm = (
    outcome: Outcome,
    onFormChange: (updatedOutcome: Outcome) => void
  ) => {
    const resolutions = outcome.possibleResolutions;

    // Safe type checking with optional chaining
    const isExplorationMode = "resolution1" in resolutions;

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="font-semibold w-36">Question</span>
          <Input
            className="flex-1"
            value={outcome.question}
            onChange={(e) =>
              onFormChange({ ...outcome, question: e.target.value })
            }
            placeholder="Question that defines the outcome"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="font-semibold w-36">Resonance</span>
          <Input
            className="flex-1"
            value={outcome.resonance}
            onChange={(e) =>
              onFormChange({ ...outcome, resonance: e.target.value })
            }
            placeholder="Why does this matter to the character or group?"
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
            value={outcome.intendedNumberOfMilestones}
            onChange={(e) =>
              onFormChange({
                ...outcome,
                intendedNumberOfMilestones: parseInt(e.target.value, 10),
              })
            }
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
            <Select
              className="text-sm"
              size="sm"
              value={isExplorationMode ? "exploration" : "challenge"}
              onChange={(e) => {
                handleResolutionTypeChange(
                  e.target.value,
                  outcome,
                  onFormChange
                );
              }}
            >
              <option value="challenge">Challenge</option>
              <option value="exploration">Exploration</option>
            </Select>
          </div>

          {!isExplorationMode ? (
            // Challenge resolutions
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="font-semibold w-36">Favorable</span>
                <Input
                  className="flex-1"
                  value={
                    "favorable" in resolutions ? resolutions.favorable : ""
                  }
                  onChange={(e) => {
                    handleResolutionFieldChange(
                      outcome,
                      "favorable",
                      e.target.value,
                      onFormChange
                    );
                  }}
                  placeholder="Resolution that is favorable to the player(s)"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold w-36">Unfavorable</span>
                <Input
                  className="flex-1"
                  value={
                    "unfavorable" in resolutions ? resolutions.unfavorable : ""
                  }
                  onChange={(e) => {
                    handleResolutionFieldChange(
                      outcome,
                      "unfavorable",
                      e.target.value,
                      onFormChange
                    );
                  }}
                  placeholder="Resolution that is unfavorable for the player(s)"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold w-36">Mixed</span>
                <Input
                  className="flex-1"
                  value={"mixed" in resolutions ? resolutions.mixed : ""}
                  onChange={(e) => {
                    handleResolutionFieldChange(
                      outcome,
                      "mixed",
                      e.target.value,
                      onFormChange
                    );
                  }}
                  placeholder="Resolution for a mixed outcome"
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
                      outcome,
                      "resolution1",
                      e.target.value,
                      onFormChange
                    );
                  }}
                  placeholder="First possible resolution"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold w-36">Resolution 2</span>
                <Input
                  className="flex-1"
                  value={(resolutions as ExplorationResolution).resolution2}
                  onChange={(e) => {
                    handleResolutionFieldChange(
                      outcome,
                      "resolution2",
                      e.target.value,
                      onFormChange
                    );
                  }}
                  placeholder="Second possible resolution"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold w-36">Resolution 3</span>
                <Input
                  className="flex-1"
                  value={(resolutions as ExplorationResolution).resolution3}
                  onChange={(e) => {
                    handleResolutionFieldChange(
                      outcome,
                      "resolution3",
                      e.target.value,
                      onFormChange
                    );
                  }}
                  placeholder="Third possible resolution"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center">
          <h3 className="text-lg font-semibold">Shared Outcomes</h3>
        </div>
        <PrimaryButton
          variant="outline"
          leftBorder={false}
          size="sm"
          onClick={handleAddOutcome}
          leftIcon={<Icons.Plus className="h-4 w-4" />}
        ></PrimaryButton>
      </div>

      {outcomes.map((outcome, index) => (
        <ExpandableItem
          key={outcome.id}
          id={outcome.id}
          title={outcome.question || `Outcome ${index + 1}`}
          data={outcome}
          editingSet={editingOutcomes}
          setEditing={setEditingOutcomes}
          onDelete={() => handleRemoveOutcome(index)}
          onSave={(updatedOutcome) =>
            handleUpdateOutcome(index, updatedOutcome)
          }
          renderEditForm={renderOutcomeForm}
          isSaveDisabled={(outcome) => !outcome.question}
        />
      ))}
    </div>
  );
};
