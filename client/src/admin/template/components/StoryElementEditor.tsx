import React from "react";
import { StoryElement } from "@core/types";
import { Input, TextArea } from "@components/ui";
import { ArrayField, ExpandableItem } from "@components";

interface StoryElementEditorProps {
  element: StoryElement;
  index: number;
  editingElements: Set<string>;
  setEditingElements: (updater: (prev: Set<string>) => Set<string>) => void;
  onDelete: (index: number) => void;
  onUpdate: (index: number, updatedElement: StoryElement) => void;
  readOnly?: boolean;
}

export const StoryElementEditor: React.FC<StoryElementEditorProps> = ({
  element,
  index,
  editingElements,
  setEditingElements,
  onDelete,
  onUpdate,
  readOnly = false,
}) => {
  const renderElementForm = (
    data: StoryElement,
    onChange: (updatedData: StoryElement) => void
  ) => {
    return (
      <div className="flex-1 space-y-4 mr-4">
        <div className="flex items-center gap-2">
          <span className="font-semibold w-24">Name</span>
          <Input
            id={`element-name-${data.id}`}
            name={`element-name-${data.id}`}
            className="flex-1"
            value={data.name}
            onChange={(e) => onChange({ ...data, name: e.target.value })}
            placeholder="Enter element name"
            disabled={readOnly}
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="font-semibold w-24">ID</span>
          <Input
            id={`element-id-${data.id}`}
            name={`element-id-${data.id}`}
            className="flex-1"
            value={data.id}
            onChange={(e) => onChange({ ...data, id: e.target.value })}
            placeholder="Enter element ID (use underscores, e.g., mr_x)"
            disabled={readOnly}
          />
        </div>

        <div className="flex items-start gap-2">
          <span className="font-semibold w-24 pt-2">Role</span>
          <TextArea
            id={`element-role-${data.id}`}
            name={`element-role-${data.id}`}
            className="flex-1"
            rows={3}
            value={data.role}
            onChange={(e) => onChange({ ...data, role: e.target.value })}
            placeholder="What can players do with this element? How does it relate to outcomes?"
            disabled={readOnly}
          />
        </div>

        <div className="flex items-start gap-2">
          <span className="font-semibold w-36 pt-2">Instructions</span>
          <TextArea
            id={`element-instructions-${data.id}`}
            name={`element-instructions-${data.id}`}
            className="flex-1"
            rows={3}
            value={data.instructions}
            onChange={(e) =>
              onChange({
                ...data,
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
          items={data.facts}
          onChange={(facts: string[]) => onChange({ ...data, facts })}
          placeholder="Enter a fact about this element"
          emptyPlaceholder="Click + to add facts"
          readOnly={readOnly}
        />
      </div>
    );
  };

  return (
    <ExpandableItem
      key={element.id}
      id={element.id}
      title={element.name || "Unnamed Element"}
      data={element}
      editingSet={editingElements}
      setEditing={setEditingElements}
      onDelete={() => onDelete(index)}
      onSave={(updatedElement) => onUpdate(index, updatedElement)}
      renderEditForm={renderElementForm}
      isSaveDisabled={(element) => !element.name || !element.id}
      readOnly={readOnly}
    />
  );
};
