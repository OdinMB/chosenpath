import React from "react";
import { PrimaryButton, Icons } from "@components/ui";
import { Outcome } from "@core/types/outcome";
import { ExpandableOutcome } from "./";
import { useOutcomes } from "../hooks/useOutcomes";

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
