import React from "react";
import { PrimaryButton, Icons } from "@components/ui";
import { Outcome } from "@core/types";
import { OutcomeEditor } from "./OutcomeEditor";
import { useOutcomeEditor } from "../hooks/useOutcomeEditor";

interface OutcomesTabProps {
  outcomes: Outcome[];
  onChange?: (outcomes: Outcome[]) => void;
  readOnly?: boolean;
}

export const OutcomesTab: React.FC<OutcomesTabProps> = ({
  outcomes,
  onChange,
  readOnly = false,
}) => {
  const {
    editingOutcomes,
    setEditingOutcomes,
    handleAddOutcome,
    handleUpdateOutcome,
    handleRemoveOutcome,
  } = useOutcomeEditor(outcomes, onChange, readOnly);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center">
          <h3 className="text-lg font-semibold">Shared Outcomes</h3>
        </div>
        {!readOnly && (
          <PrimaryButton
            variant="outline"
            leftBorder={false}
            size="sm"
            onClick={handleAddOutcome}
            leftIcon={<Icons.Plus className="h-4 w-4" />}
          />
        )}
      </div>

      {outcomes.map((outcome, index) => (
        <OutcomeEditor
          key={outcome.id}
          outcome={outcome}
          index={index}
          editingOutcomes={editingOutcomes}
          setEditingOutcomes={setEditingOutcomes}
          onDelete={() => handleRemoveOutcome(index)}
          onUpdate={(idx, updatedOutcome) =>
            handleUpdateOutcome(idx, updatedOutcome as Outcome)
          }
          readOnly={readOnly}
        />
      ))}
    </div>
  );
};
