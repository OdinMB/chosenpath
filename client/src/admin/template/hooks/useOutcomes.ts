import { useState } from "react";
import { v4 as uuidv4 } from "uuid";
import {
  Outcome,
  ChallengeResolution,
  ExplorationResolution,
  ResolutionType,
} from "@core/types";

export const useOutcomes = (
  initialOutcomes: Outcome[] = [],
  onChange?: (outcomes: Outcome[]) => void,
  readOnly = false
) => {
  const [editingOutcomes, setEditingOutcomes] = useState<Set<string>>(
    new Set()
  );

  const handleAddOutcome = () => {
    if (readOnly || !onChange) return;

    const tempId = uuidv4();
    const newOutcome: Outcome = {
      id: tempId,
      question: "",
      resonance: "",
      possibleResolutions: {
        favorable: "",
        unfavorable: "",
        mixed: "",
      },
      intendedNumberOfMilestones: 2,
      milestones: [],
    };

    setEditingOutcomes((prev) => new Set(prev).add(tempId));
    onChange([...initialOutcomes, newOutcome]);
  };

  const handleUpdateOutcome = (index: number, updatedOutcome: Outcome) => {
    if (readOnly || !onChange) return;

    const updatedOutcomes = [...initialOutcomes];
    updatedOutcomes[index] = updatedOutcome;
    onChange(updatedOutcomes);
  };

  const handleRemoveOutcome = (index: number) => {
    if (readOnly || !onChange) return;

    const updatedOutcomes = initialOutcomes.filter((_, i) => i !== index);
    onChange(updatedOutcomes);
  };

  // Type guard to check if resolutions are challenge type
  const isChallenge = (
    resolutions: ResolutionType
  ): resolutions is ChallengeResolution => {
    return (
      "favorable" in resolutions &&
      "unfavorable" in resolutions &&
      "mixed" in resolutions
    );
  };

  // Type guard to check if resolutions are exploration type
  const isExploration = (
    resolutions: ResolutionType
  ): resolutions is ExplorationResolution => {
    return (
      "resolution1" in resolutions &&
      "resolution2" in resolutions &&
      "resolution3" in resolutions
    );
  };

  const handleResolutionTypeChange = (
    type: string,
    outcome: Outcome,
    onOutcomeChange: (updatedOutcome: Outcome) => void
  ) => {
    if (readOnly) return;

    let newResolutions: ResolutionType;

    if (type === "challenge") {
      newResolutions = {
        favorable: "",
        unfavorable: "",
        mixed: "",
      };
    } else {
      newResolutions = {
        resolution1: "",
        resolution2: "",
        resolution3: "",
      };
    }

    const updatedOutcome = {
      ...outcome,
      possibleResolutions: newResolutions,
    };
    onOutcomeChange(updatedOutcome);
  };

  const handleResolutionFieldChange = (
    outcome: Outcome,
    field: string,
    value: string,
    onOutcomeChange: (updatedOutcome: Outcome) => void
  ) => {
    if (readOnly) return;

    const resolutions = { ...outcome.possibleResolutions };

    if (
      isChallenge(resolutions) &&
      (field === "favorable" || field === "unfavorable" || field === "mixed")
    ) {
      resolutions[field] = value;
    } else if (
      isExploration(resolutions) &&
      (field === "resolution1" ||
        field === "resolution2" ||
        field === "resolution3")
    ) {
      resolutions[field] = value;
    }

    const updatedOutcome = {
      ...outcome,
      possibleResolutions: resolutions,
    };
    onOutcomeChange(updatedOutcome);
  };

  return {
    outcomes: initialOutcomes,
    addOutcome: handleAddOutcome,
    updateOutcome: handleUpdateOutcome,
    deleteOutcome: handleRemoveOutcome,
    isChallenge,
    isExploration,
    handleResolutionTypeChange,
    handleResolutionFieldChange,
    // For backward compatibility
    editingOutcomes,
    setEditingOutcomes,
    handleAddOutcome,
    handleUpdateOutcome,
    handleRemoveOutcome,
  };
};
