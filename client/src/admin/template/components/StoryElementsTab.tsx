import React from "react";
import { StoryElement } from "@core/types";
import {
  InfoIcon,
  Input,
  TextArea,
  PrimaryButton,
  Icons,
} from "@components/ui";
import { ArrayField, ExpandableItem } from "@components";
import { useStoryElements } from "../hooks/useStoryElements";

interface StoryElementsTabProps {
  elements: StoryElement[];
  onChange?: (elements: StoryElement[]) => void;
  readOnly?: boolean;
}

export const StoryElementsTab: React.FC<StoryElementsTabProps> = ({
  elements,
  onChange,
  readOnly = false,
}) => {
  const {
    editingElements,
    handleAddElement,
    handleUpdateElement,
    handleRemoveElement,
    setEditingElement,
    removeEditingElement,
  } = useStoryElements(elements, onChange, readOnly);

  // Function to set editing state compatible with ExpandableItem
  const setEditingElements = (updater: (prev: Set<string>) => Set<string>) => {
    if (readOnly) return;

    const newSet = updater(editingElements);
    // Add elements to edit mode
    Array.from(newSet).forEach((id) => {
      if (!editingElements.has(id)) {
        setEditingElement(id);
      }
    });
    // Remove elements from edit mode
    Array.from(editingElements).forEach((id) => {
      if (!newSet.has(id)) {
        removeEditingElement(id);
      }
    });
  };

  const renderElementForm = (
    element: StoryElement,
    onFormChange: (updatedElement: StoryElement) => void
  ) => {
    return (
      <div className="flex-1 space-y-4 mr-4">
        <div className="flex items-center gap-2">
          <span className="font-semibold w-24">Name</span>
          <Input
            id={`element-name-${element.id}`}
            name={`element-name-${element.id}`}
            className="flex-1"
            value={element.name}
            onChange={(e) => onFormChange({ ...element, name: e.target.value })}
            placeholder="Enter element name"
            disabled={readOnly}
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="font-semibold w-24">ID</span>
          <Input
            id={`element-id-${element.id}`}
            name={`element-id-${element.id}`}
            className="flex-1"
            value={element.id}
            onChange={(e) => onFormChange({ ...element, id: e.target.value })}
            placeholder="Enter element ID (use underscores, e.g., mr_x)"
            disabled={readOnly}
          />
        </div>

        <div className="flex items-start gap-2">
          <span className="font-semibold w-24 pt-2">Role</span>
          <TextArea
            id={`element-role-${element.id}`}
            name={`element-role-${element.id}`}
            className="flex-1"
            rows={3}
            value={element.role}
            onChange={(e) => onFormChange({ ...element, role: e.target.value })}
            placeholder="What can players do with this element? How does it relate to outcomes?"
            disabled={readOnly}
          />
        </div>

        <div className="flex items-start gap-2">
          <span className="font-semibold w-36 pt-2">Instructions</span>
          <TextArea
            id={`element-instructions-${element.id}`}
            name={`element-instructions-${element.id}`}
            className="flex-1"
            rows={3}
            value={element.instructions}
            onChange={(e) =>
              onFormChange({
                ...element,
                instructions: e.target.value,
              })
            }
            placeholder="Instructions on how to use this element (narrative and mechanics)"
            disabled={readOnly}
          />
        </div>

        <ArrayField
          title="Facts"
          tooltipText="Three facts about the story element. For NPCs, include their preferred pronouns and motivations."
          items={element.facts}
          onChange={(facts: string[]) => onFormChange({ ...element, facts })}
          placeholder="Enter a fact about this element"
          emptyPlaceholder="Click + to add facts"
          readOnly={readOnly}
        />
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center">
          <h3 className="text-lg font-semibold">Story Elements</h3>
          <InfoIcon
            tooltipText="Objects, characters, or concepts that players can interact with"
            position="right"
            className="ml-2 mt-1"
          />
        </div>
        {!readOnly && (
          <PrimaryButton
            variant="outline"
            leftBorder={false}
            size="sm"
            onClick={handleAddElement}
            leftIcon={<Icons.Plus className="h-4 w-4" />}
          />
        )}
      </div>

      {elements.map((element, index) => (
        <ExpandableItem
          key={element.id}
          id={element.id}
          title={element.name || "Unnamed Element"}
          data={element}
          editingSet={editingElements}
          setEditing={setEditingElements}
          onDelete={() => handleRemoveElement(index)}
          onSave={(updatedElement) =>
            handleUpdateElement(index, updatedElement)
          }
          renderEditForm={renderElementForm}
          isSaveDisabled={(element) => !element.name || !element.id}
          readOnly={readOnly}
        />
      ))}
    </div>
  );
};
