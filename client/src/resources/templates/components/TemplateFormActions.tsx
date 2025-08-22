import React from "react";
import { PrimaryButton, Icons } from "components/ui";

interface TemplateFormActionsProps {
  variant: "mobile" | "bottom";
  hasUnsavedChanges: boolean;
  saveHistoryLength: number;
  isLoading: boolean;
  onDiscardChanges: () => void;
  onShowRevertModal: () => void;
}

export const TemplateFormActions: React.FC<TemplateFormActionsProps> = ({
  variant,
  hasUnsavedChanges,
  saveHistoryLength,
  isLoading,
  onDiscardChanges,
  onShowRevertModal,
}) => {
  const isMobile = variant === "mobile";

  const buttonSize = isMobile ? "sm" : "md";
  const containerClasses = isMobile 
    ? "flex gap-1" 
    : "flex gap-2";

  const saveButtonClasses = isMobile
    ? `h-10 px-4 ${hasUnsavedChanges ? "ring-2 ring-secondary ring-offset-1" : ""}`
    : `flex-1 ${hasUnsavedChanges ? "ring-2 ring-secondary ring-offset-2" : ""}`;

  return (
    <div className={containerClasses}>
      {hasUnsavedChanges && (
        <PrimaryButton
          type="button"
          variant="outline"
          leftBorder={false}
          size={buttonSize}
          onClick={onDiscardChanges}
          title="Discard unsaved changes"
          leftIcon={<Icons.Close className="h-4 w-4" />}
        />
      )}
      {saveHistoryLength > 1 && (
        <PrimaryButton
          type="button"
          variant="outline"
          leftBorder={false}
          size={buttonSize}
          onClick={onShowRevertModal}
          title="Revert to previous save"
          leftIcon={<Icons.Undo className="h-4 w-4" />}
        />
      )}
      <PrimaryButton
        type="submit"
        disabled={isLoading}
        isLoading={isLoading}
        size={buttonSize}
        className={saveButtonClasses}
      >
        {hasUnsavedChanges && (
          <span 
            className={`inline-block bg-white rounded-full ${
              isMobile ? "w-1.5 h-1.5 mr-1.5" : "w-2 h-2 mr-2"
            }`} 
          />
        )}
        Save
      </PrimaryButton>
    </div>
  );
};