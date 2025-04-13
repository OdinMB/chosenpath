import React from "react";
import { Outcome } from "@core/types";
import { ExpandableItem } from "./";
import { InfoIcon, Input, Select } from "@components/ui";

// Define PlayerOutcome here since it's not exported from a module
interface PlayerOutcome {
  id: string;
  question: string;
  resonance: string;
  possibleResolutions:
    | { favorable: string; unfavorable: string; mixed: string }
    | { resolution1: string; resolution2: string; resolution3: string };
  intendedNumberOfMilestones: number;
  milestones: string[];
}

// Define resolution types interfaces
interface ChallengeResolution {
  favorable: string;
  unfavorable: string;
  mixed: string;
}

interface ExplorationResolution {
  resolution1: string;
  resolution2: string;
  resolution3: string;
}

type ResolutionType = ChallengeResolution | ExplorationResolution;

type OutcomeType = Outcome | PlayerOutcome;

interface ExpandableOutcomeProps {
  outcome: OutcomeType;
  index: number;
  editingOutcomes: Set<string>;
  setEditingOutcomes: (updater: (prev: Set<string>) => Set<string>) => void;
  onDelete: (index: number) => void;
  onUpdate: (index: number, updatedOutcome: OutcomeType) => void;
}

export const ExpandableOutcome: React.FC<ExpandableOutcomeProps> = ({
  outcome,
  index,
  editingOutcomes,
  setEditingOutcomes,
  onDelete,
  onUpdate,
}) => {
  // Helper functions to check resolution type
  const isChallenge = (res: ResolutionType): res is ChallengeResolution =>
    "favorable" in res;

  const isExploration = (res: ResolutionType): res is ExplorationResolution =>
    "resolution1" in res;

  const renderOutcomeForm = (
    data: OutcomeType,
    onChange: (updatedData: OutcomeType) => void
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
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="font-semibold w-36">Resonance</span>
          <Input
            className="flex-1"
            value={data.resonance}
            onChange={(e) => onChange({ ...data, resonance: e.target.value })}
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
            value={data.intendedNumberOfMilestones}
            onChange={(e) =>
              onChange({
                ...data,
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
              value={isExploration(resolutions) ? "exploration" : "challenge"}
              onChange={(e) => {
                const type = e.target.value;

                // Get existing values to preserve them
                let favorable = "";
                let unfavorable = "";
                let mixed = "";
                let resolution1 = "";
                let resolution2 = "";
                let resolution3 = "";

                if (isChallenge(resolutions)) {
                  favorable = resolutions.favorable;
                  unfavorable = resolutions.unfavorable;
                  mixed = resolutions.mixed;
                } else if (isExploration(resolutions)) {
                  resolution1 = resolutions.resolution1;
                  resolution2 = resolutions.resolution2;
                  resolution3 = resolutions.resolution3;
                }

                if (type === "challenge") {
                  onChange({
                    ...data,
                    possibleResolutions: {
                      favorable: favorable || resolution1 || "",
                      unfavorable: unfavorable || resolution2 || "",
                      mixed: mixed || resolution3 || "",
                    },
                  });
                } else {
                  onChange({
                    ...data,
                    possibleResolutions: {
                      resolution1: resolution1 || favorable || "",
                      resolution2: resolution2 || unfavorable || "",
                      resolution3: resolution3 || mixed || "",
                    },
                  });
                }
              }}
            >
              <option value="challenge">Challenge</option>
              <option value="exploration">Exploration</option>
            </Select>
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
                    const updated = {
                      ...data,
                      possibleResolutions: {
                        ...resolutions,
                        favorable: e.target.value,
                      },
                    };
                    onChange(updated);
                  }}
                  placeholder="Resolution that is favorable to the player(s)"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold w-36">Unfavorable</span>
                <Input
                  className="flex-1"
                  value={resolutions.unfavorable}
                  onChange={(e) => {
                    const updated = {
                      ...data,
                      possibleResolutions: {
                        ...resolutions,
                        unfavorable: e.target.value,
                      },
                    };
                    onChange(updated);
                  }}
                  placeholder="Resolution that is unfavorable for the player(s)"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold w-36">Mixed</span>
                <Input
                  className="flex-1"
                  value={resolutions.mixed}
                  onChange={(e) => {
                    const updated = {
                      ...data,
                      possibleResolutions: {
                        ...resolutions,
                        mixed: e.target.value,
                      },
                    };
                    onChange(updated);
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
                    const updated = {
                      ...data,
                      possibleResolutions: {
                        ...resolutions,
                        resolution1: e.target.value,
                      },
                    };
                    onChange(updated);
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
                    const updated = {
                      ...data,
                      possibleResolutions: {
                        ...resolutions,
                        resolution2: e.target.value,
                      },
                    };
                    onChange(updated);
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
                    const updated = {
                      ...data,
                      possibleResolutions: {
                        ...resolutions,
                        resolution3: e.target.value,
                      },
                    };
                    onChange(updated);
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
    />
  );
};
