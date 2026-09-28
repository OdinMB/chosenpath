import { useState } from "react";
import { v4 as uuidv4 } from "uuid";
import {
  Outcome,
  ChallengeResolution,
  ContestResolution,
  ExplorationResolution,
  ResolutionType,
} from "core/types";
import {
  emptyResolutions,
  resolutionKindOf,
  withResolutionField,
  type ResolutionKind,
} from "../utils/outcomeResolutions";

export const useOutcomeEditor = (
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

  // Type guards for the three kinds (outcomeResolutions.ts reads the kind)
  const isChallenge = (
    resolutions: ResolutionType
  ): resolutions is ChallengeResolution =>
    resolutionKindOf(resolutions) === "challenge";

  const isContest = (
    resolutions: ResolutionType
  ): resolutions is ContestResolution =>
    resolutionKindOf(resolutions) === "contest";

  const isExploration = (
    resolutions: ResolutionType
  ): resolutions is ExplorationResolution =>
    resolutionKindOf(resolutions) === "exploration";

  /** A new kind starts with that kind's empty resolutions. */
  const handleResolutionTypeChange = (
    type: string,
    outcome: Outcome,
    onOutcomeChange: (updatedOutcome: Outcome) => void
  ) => {
    if (readOnly) return;
    const kind: ResolutionKind =
      type === "contest" || type === "exploration" ? type : "challenge";
    onOutcomeChange({ ...outcome, possibleResolutions: emptyResolutions(kind) });
  };

  /** One resolution's text; a contest's sides are kept like any other field. */
  const handleResolutionFieldChange = (
    outcome: Outcome,
    field: string,
    value: string,
    onOutcomeChange: (updatedOutcome: Outcome) => void
  ) => {
    if (readOnly) return;
    onOutcomeChange({
      ...outcome,
      possibleResolutions: withResolutionField(
        outcome.possibleResolutions,
        field,
        value
      ),
    });
  };

  return {
    outcomes: initialOutcomes,
    addOutcome: handleAddOutcome,
    updateOutcome: handleUpdateOutcome,
    deleteOutcome: handleRemoveOutcome,
    isChallenge,
    isContest,
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
