import React, { ReactNode, useState } from "react";
import { PrimaryButton, Icons } from "@components/ui";

interface ExpandableItemProps<T> {
  /** Unique identifier for this item */
  id: string;
  /** Display name for the item when collapsed */
  title: ReactNode;
  /** Object that will be edited */
  data: T;
  /** Set of IDs currently being edited */
  editingSet: Set<string>;
  /** Function to update the editing set (add this item's ID) */
  setEditing: (updater: (prev: Set<string>) => Set<string>) => void;
  /** Called when delete button is clicked */
  onDelete: () => void;
  /** Called when save button is clicked with the updated data */
  onSave: (data: T) => void;
  /** Render function for the edit form */
  renderEditForm: (
    data: T,
    onChange: (updatedData: T) => void,
    onCancel: () => void
  ) => ReactNode;
  /** Whether the save button should be disabled */
  isSaveDisabled?: (data: T) => boolean;
  /** Whether the component is in read-only mode */
  readOnly?: boolean;
}

export function ExpandableItem<T>({
  id,
  title,
  data,
  editingSet,
  setEditing,
  onDelete,
  onSave,
  renderEditForm,
  isSaveDisabled = () => false,
  readOnly = false,
}: ExpandableItemProps<T>) {
  const isEditing = editingSet.has(id);
  const [isExpanded, setIsExpanded] = useState(false);
  const [localData, setLocalData] = useState<T>(data);

  // Update localData when data prop changes
  React.useEffect(() => {
    setLocalData(data);
  }, [data]);

  const handleToggleExpand = () => {
    if (readOnly) {
      setIsExpanded(!isExpanded);
    } else {
      if (!isExpanded) {
        // When expanding, enter edit mode in non-readOnly
        setEditing((prev) => new Set(prev).add(id));
      }
      setIsExpanded(!isExpanded);
    }
  };

  const handleStartEditing = () => {
    if (readOnly) return;
    setEditing((prev) => new Set(prev).add(id));
    setIsExpanded(true);
  };

  const handleCancelEdit = () => {
    setLocalData(data); // Reset to original data
    setEditing((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setIsExpanded(false);
  };

  const handleBack = () => {
    setIsExpanded(false);
  };

  const handleSave = () => {
    onSave(localData);
    setEditing((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setIsExpanded(false);
  };

  const handleChange = (updatedData: T) => {
    setLocalData(updatedData);
  };

  // When in readOnly mode and expanded
  if (readOnly && isExpanded) {
    return (
      <div className="bg-white p-4 rounded-lg shadow mb-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-medium text-lg">{title}</h3>
          <button
            onClick={handleToggleExpand}
            className="text-gray-500 hover:text-gray-700"
            aria-label="Collapse"
          >
            <Icons.ChevronUp className="h-5 w-5" />
          </button>
        </div>
        {renderEditForm(
          data,
          () => {}, // No-op since it's readonly
          () => {}
        )}
        <div className="flex justify-end gap-2 mt-4">
          <PrimaryButton
            onClick={handleBack}
            variant="outline"
            leftBorder={false}
          >
            Back
          </PrimaryButton>
        </div>
      </div>
    );
  }

  // When in readOnly mode and collapsed
  if (readOnly) {
    return (
      <div className="bg-white p-4 rounded-lg shadow mb-4 flex justify-between items-center">
        <span className="font-medium">{title}</span>
        <button
          onClick={handleToggleExpand}
          className="text-gray-500 hover:text-gray-700"
          aria-label="Expand"
        >
          <Icons.ChevronDown className="h-5 w-5" />
        </button>
      </div>
    );
  }

  // Original interactive editing behavior - collapsed view
  if (!isEditing) {
    const isNoOpFunction = onDelete.toString().replace(/\s/g, "") === "()=>{}";

    return (
      <div className="bg-white p-4 rounded-lg shadow mb-4 flex justify-between items-center">
        <span className="font-medium">{title}</span>
        <div className="flex gap-2">
          <button
            onClick={handleStartEditing}
            className="text-secondary hover:text-secondary-700"
            aria-label={`Edit ${title}`}
          >
            <Icons.Edit className="h-5 w-5" />
          </button>
          {/* Only show delete button if onDelete is not an empty function */}
          {!isNoOpFunction && (
            <button
              onClick={onDelete}
              className="text-tertiary hover:text-tertiary-700"
              aria-label={`Remove ${title}`}
            >
              <Icons.Trash className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>
    );
  }

  // Edit mode - expanded with form
  return (
    <div className="bg-white p-4 rounded-lg shadow mb-4">
      {renderEditForm(localData, handleChange, handleCancelEdit)}
      <div className="flex justify-end gap-2 mt-4">
        <PrimaryButton
          onClick={handleCancelEdit}
          variant="outline"
          leftBorder={false}
          size="sm"
        >
          Cancel
        </PrimaryButton>
        <PrimaryButton
          onClick={handleSave}
          disabled={isSaveDisabled(localData)}
          variant="outline"
        >
          Save
        </PrimaryButton>
      </div>
    </div>
  );
}
