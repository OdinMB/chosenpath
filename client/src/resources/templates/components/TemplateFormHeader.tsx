import React from "react";
import { PrimaryButton, Icons } from "components/ui";

interface TemplateFormHeaderProps {
  title: string;
  hasUnsavedChanges: boolean;
  saveHistoryLength: number;
  isLoading: boolean;
  onDiscardChanges: () => void;
  onShowRevertModal: () => void;
}

export const TemplateFormHeader: React.FC<TemplateFormHeaderProps> = ({
  title,
  hasUnsavedChanges,
  saveHistoryLength,
  isLoading,
  onDiscardChanges,
  onShowRevertModal,
}) => {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-xl font-semibold text-gray-800 truncate">
        {title || "New Template"}
      </h2>
      {/* Desktop save button (kept next to title) */}
      <div className="hidden lg:flex gap-2">
        {hasUnsavedChanges && (
          <PrimaryButton
            type="button"
            variant="outline"
            leftBorder={false}
            size="sm"
            onClick={onDiscardChanges}
            title="Discard unsaved changes"
            leftIcon={<Icons.Close className="h-4 w-4" />}
          />
        )}
        {saveHistoryLength > 0 && (
          <PrimaryButton
            type="button"
            variant="outline"
            leftBorder={false}
            size="sm"
            onClick={onShowRevertModal}
            title="Revert to previous save"
            leftIcon={<Icons.Undo className="h-4 w-4" />}
          />
        )}
        <PrimaryButton
          type="submit"
          disabled={isLoading}
          isLoading={isLoading}
          size="lg"
          className={
            hasUnsavedChanges ? "ring-2 ring-secondary ring-offset-2" : ""
          }
        >
          {hasUnsavedChanges && (
            <span className="inline-block w-2 h-2 bg-white rounded-full mr-2" />
          )}
          Save
        </PrimaryButton>
      </div>
    </div>
  );
};