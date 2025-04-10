import React, { useState } from "react";
import { PrimaryButton } from "@components/ui/PrimaryButton";
import { Icons } from "@components/ui/Icons";
import { Outcome } from "@core/types/outcome";
import { ExpandableOutcome } from "./ExpandableOutcome";

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

  const handleUpdateOutcome = (index: number, updatedOutcome: Outcome) => {
    const updated = [...outcomes];
    updated[index] = updatedOutcome;
    onChange(updated);
  };

  const handleRemoveOutcome = (index: number) => {
    const updated = outcomes.filter((_, i) => i !== index);
    onChange(updated);
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
        <ExpandableOutcome
          key={outcome.id}
          outcome={outcome}
          index={index}
          editingOutcomes={editingOutcomes}
          setEditingOutcomes={setEditingOutcomes}
          onDelete={handleRemoveOutcome}
          onUpdate={handleUpdateOutcome}
        />
      ))}
    </div>
  );
};
