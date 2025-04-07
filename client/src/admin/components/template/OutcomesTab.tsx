import React, { useState } from "react";
import { PrimaryButton } from "@components/ui/PrimaryButton";
import { Icons } from "@components/ui/Icons";
import { Input } from "@components/ui/Input";
import { Outcome } from "@core/types/outcome";

interface OutcomesTabProps {
  outcomes: Outcome[];
  onChange: (outcomes: Outcome[]) => void;
}

export const OutcomesTab: React.FC<OutcomesTabProps> = ({
  outcomes,
  onChange,
}) => {
  // Track which outcomes are being edited by their IDs
  const [editingOutcomes, setEditingOutcomes] = useState<Set<string>>(
    new Set()
  );

  const handleAddOutcome = () => {
    const tempId = `shared_outcome_${Date.now()}`;
    const newOutcome: Outcome = {
      id: tempId,
      question: "",
      possibleResolutions: {
        favorable: "",
        unfavorable: "",
        mixed: "",
      },
      resonance: "",
      intendedNumberOfMilestones: 2,
      milestones: [],
    };
    // Start in edit mode
    setEditingOutcomes((prev) => new Set(prev).add(tempId));
    onChange([...outcomes, newOutcome]);
  };

  const handleUpdateOutcome = (index: number, updates: Partial<Outcome>) => {
    const updated = outcomes.map((outcome, i) =>
      i === index ? { ...outcome, ...updates } : outcome
    );
    onChange(updated);
  };

  const handleRemoveOutcome = (index: number) => {
    const updated = outcomes.filter((_, i) => i !== index);
    onChange(updated);
  };

  const OutcomeEditor = ({
    outcome,
    index,
  }: {
    outcome: Outcome;
    index: number;
  }) => {
    const isEditing = editingOutcomes.has(outcome.id);
    const [localOutcome, setLocalOutcome] = useState<Outcome>(outcome);

    if (!isEditing) {
      return (
        <div className="bg-white p-4 rounded-lg shadow mb-4 flex justify-between items-center">
          <span className="font-medium">
            {outcome.question || "Unnamed Outcome"}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() =>
                setEditingOutcomes((prev) => new Set(prev).add(outcome.id))
              }
              className="text-secondary hover:text-secondary-700"
              aria-label={`Edit ${outcome.question}`}
            >
              <Icons.Edit className="h-5 w-5" />
            </button>
            <button
              onClick={() => handleRemoveOutcome(index)}
              className="text-tertiary hover:text-tertiary-700"
              aria-label={`Remove ${outcome.question}`}
            >
              <Icons.Trash className="h-5 w-5" />
            </button>
          </div>
        </div>
      );
    }

    const handleSave = () => {
      if (localOutcome.question && localOutcome.id.startsWith("shared_")) {
        handleUpdateOutcome(index, localOutcome);
        setEditingOutcomes((prev) => {
          const next = new Set(prev);
          next.delete(outcome.id);
          return next;
        });
      }
    };

    return (
      <div className="bg-white p-4 rounded-lg shadow mb-4">
        <div className="flex justify-between items-start mb-4">
          <div className="flex-1 space-y-4 mr-4">
            <div className="flex flex-col gap-2">
              <h3 className="font-semibold mb-1">Question</h3>
              <Input
                id={`outcome-question-${outcome.id}`}
                name={`outcome-question-${outcome.id}`}
                value={localOutcome.question}
                onChange={(e) =>
                  setLocalOutcome((prev) => ({
                    ...prev,
                    question: e.target.value,
                  }))
                }
                placeholder="Question that defines the outcome"
              />
            </div>

            <div className="flex flex-col gap-2">
              <h3 className="font-semibold mb-1">ID</h3>
              <div className="flex">
                <span className="inline-flex items-center px-3 rounded-l border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm">
                  shared_
                </span>
                <input
                  id={`outcome-id-${outcome.id}`}
                  name={`outcome-id-${outcome.id}`}
                  className="flex-1 p-2 border rounded-r"
                  value={localOutcome.id.replace(/^shared_/, "")}
                  onChange={(e) => {
                    const newId = "shared_" + e.target.value;
                    setLocalOutcome((prev) => ({
                      ...prev,
                      id: newId,
                    }));
                  }}
                  placeholder="Enter outcome ID (e.g., murderer_found)"
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <h3 className="font-semibold mb-1">Resonance</h3>
              <textarea
                id={`outcome-resonance-${outcome.id}`}
                name={`outcome-resonance-${outcome.id}`}
                className="w-full p-2 border rounded"
                rows={3}
                value={localOutcome.resonance}
                onChange={(e) =>
                  setLocalOutcome((prev) => ({
                    ...prev,
                    resonance: e.target.value,
                  }))
                }
                placeholder="What makes this meaningful to the group? If competitive, what drives each player's stake in this outcome?"
              />
            </div>

            <div className="flex flex-col gap-2">
              <h3 className="font-semibold mb-1">Number of Milestones</h3>
              <Input
                id={`outcome-milestones-${outcome.id}`}
                name={`outcome-milestones-${outcome.id}`}
                type="number"
                min={1}
                max={3}
                value={localOutcome.intendedNumberOfMilestones}
                onChange={(e) =>
                  setLocalOutcome((prev) => ({
                    ...prev,
                    intendedNumberOfMilestones: parseInt(e.target.value, 10),
                  }))
                }
              />
              <span className="text-sm text-gray-500">
                1 for side-outcomes, 2 as default, 3 for particularly important
                outcomes
              </span>
            </div>

            <div className="flex flex-col gap-2">
              <h3 className="font-semibold mb-1">Possible Resolutions</h3>
              {"favorable" in localOutcome.possibleResolutions ? (
                // Challenge resolutions
                <>
                  <div className="flex flex-col gap-2">
                    <h4 className="text-sm font-medium">Favorable</h4>
                    <textarea
                      className="w-full p-2 border rounded"
                      rows={2}
                      value={localOutcome.possibleResolutions.favorable}
                      onChange={(e) =>
                        setLocalOutcome((prev) => ({
                          ...prev,
                          possibleResolutions: {
                            ...prev.possibleResolutions,
                            favorable: e.target.value,
                          },
                        }))
                      }
                      placeholder="Resolution that is favorable to the player(s)"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <h4 className="text-sm font-medium">Unfavorable</h4>
                    <textarea
                      className="w-full p-2 border rounded"
                      rows={2}
                      value={localOutcome.possibleResolutions.unfavorable}
                      onChange={(e) =>
                        setLocalOutcome((prev) => ({
                          ...prev,
                          possibleResolutions: {
                            ...prev.possibleResolutions,
                            unfavorable: e.target.value,
                          },
                        }))
                      }
                      placeholder="Resolution that is unfavorable for the player(s)"
                    />
                  </div>
                </>
              ) : "sideAWins" in localOutcome.possibleResolutions ? (
                // Contest resolutions
                <>
                  <div className="flex flex-col gap-2">
                    <h4 className="text-sm font-medium">Side A Wins</h4>
                    <textarea
                      className="w-full p-2 border rounded"
                      rows={2}
                      value={localOutcome.possibleResolutions.sideAWins}
                      onChange={(e) =>
                        setLocalOutcome((prev) => ({
                          ...prev,
                          possibleResolutions: {
                            ...prev.possibleResolutions,
                            sideAWins: e.target.value,
                          },
                        }))
                      }
                      placeholder="Resolution of side A winning"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <h4 className="text-sm font-medium">Side B Wins</h4>
                    <textarea
                      className="w-full p-2 border rounded"
                      rows={2}
                      value={localOutcome.possibleResolutions.sideBWins}
                      onChange={(e) =>
                        setLocalOutcome((prev) => ({
                          ...prev,
                          possibleResolutions: {
                            ...prev.possibleResolutions,
                            sideBWins: e.target.value,
                          },
                        }))
                      }
                      placeholder="Resolution of side B winning"
                    />
                  </div>
                </>
              ) : (
                // Exploration resolutions
                <>
                  <div className="flex flex-col gap-2">
                    <h4 className="text-sm font-medium">Resolution 1</h4>
                    <textarea
                      className="w-full p-2 border rounded"
                      rows={2}
                      value={localOutcome.possibleResolutions.resolution1}
                      onChange={(e) =>
                        setLocalOutcome((prev) => ({
                          ...prev,
                          possibleResolutions: {
                            ...prev.possibleResolutions,
                            resolution1: e.target.value,
                          },
                        }))
                      }
                      placeholder="First possible resolution"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <h4 className="text-sm font-medium">Resolution 2</h4>
                    <textarea
                      className="w-full p-2 border rounded"
                      rows={2}
                      value={localOutcome.possibleResolutions.resolution2}
                      onChange={(e) =>
                        setLocalOutcome((prev) => ({
                          ...prev,
                          possibleResolutions: {
                            ...prev.possibleResolutions,
                            resolution2: e.target.value,
                          },
                        }))
                      }
                      placeholder="Second possible resolution"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <h4 className="text-sm font-medium">Resolution 3</h4>
                    <textarea
                      className="w-full p-2 border rounded"
                      rows={2}
                      value={localOutcome.possibleResolutions.resolution3}
                      onChange={(e) =>
                        setLocalOutcome((prev) => ({
                          ...prev,
                          possibleResolutions: {
                            ...prev.possibleResolutions,
                            resolution3: e.target.value,
                          },
                        }))
                      }
                      placeholder="Third possible resolution"
                    />
                  </div>
                </>
              )}
              <div className="flex flex-col gap-2">
                <h4 className="text-sm font-medium">Mixed/Draw</h4>
                <textarea
                  className="w-full p-2 border rounded"
                  rows={2}
                  value={
                    "mixed" in localOutcome.possibleResolutions
                      ? localOutcome.possibleResolutions.mixed
                      : ""
                  }
                  onChange={(e) =>
                    setLocalOutcome((prev) => ({
                      ...prev,
                      possibleResolutions: {
                        ...prev.possibleResolutions,
                        mixed: e.target.value,
                      },
                    }))
                  }
                  placeholder="Resolution for a mixed outcome or draw"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <button
              onClick={() => handleRemoveOutcome(index)}
              className="text-tertiary hover:text-tertiary-700"
              aria-label="Remove outcome"
            >
              <Icons.Trash className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <PrimaryButton
            onClick={handleSave}
            disabled={
              !localOutcome.question || !localOutcome.id.startsWith("shared_")
            }
            variant="outline"
          >
            Save
          </PrimaryButton>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">Shared Outcomes</h3>
        <PrimaryButton
          variant="outline"
          size="sm"
          onClick={handleAddOutcome}
          leftIcon={<Icons.Plus className="h-4 w-4" />}
        >
          Add
        </PrimaryButton>
      </div>

      {outcomes.map((outcome, index) => (
        <OutcomeEditor key={outcome.id} outcome={outcome} index={index} />
      ))}
    </div>
  );
};
