import { useState } from "react";
import { Outcome } from "@core/types/outcome";

interface UseOutcomesResult {
  editingOutcomes: Set<string>;
  setEditingOutcomes: (callback: (prev: Set<string>) => Set<string>) => void;
  handleAddOutcome: () => void;
  handleUpdateOutcome: (index: number, updatedOutcome: Outcome) => void;
  handleRemoveOutcome: (index: number) => void;
}

export function useOutcomes(
  outcomes: Outcome[],
  onChange: (outcomes: Outcome[]) => void
): UseOutcomesResult {
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

  const handleUpdateOutcome = (index: number, updatedOutcome: Outcome) => {
    const updated = [...outcomes];
    updated[index] = updatedOutcome;
    onChange(updated);
  };

  const handleRemoveOutcome = (index: number) => {
    const updated = outcomes.filter((_, i) => i !== index);
    onChange(updated);
  };

  return {
    editingOutcomes,
    setEditingOutcomes,
    handleAddOutcome,
    handleUpdateOutcome,
    handleRemoveOutcome,
  };
}
