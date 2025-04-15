import React from "react";
import { StoryElement } from "@core/types";
import {
  InfoIcon,
  Input,
  TextArea,
  PrimaryButton,
  Icons,
} from "@components/ui";
import { useStoryElements } from "../hooks/useStoryElements";

interface StoryElementsTabProps {
  elements: StoryElement[];
  onChange: (elements: StoryElement[]) => void;
}

type ElementEditorProps = {
  element: StoryElement;
  index: number;
  onSave: (element: StoryElement) => void;
  onRemove: () => void;
  onStartEdit: () => void;
  isEditing: boolean;
};

const ElementItem: React.FC<{
  element: StoryElement;
  onEdit: () => void;
  onRemove: () => void;
}> = ({ element, onEdit, onRemove }) => (
  <div className="bg-white p-4 rounded-lg shadow mb-4 flex justify-between items-center">
    <span className="font-medium">{element.name || "Unnamed Element"}</span>
    <div className="flex gap-2">
      <button
        onClick={onEdit}
        className="text-secondary hover:text-secondary-700"
        aria-label={`Edit ${element.name}`}
      >
        <Icons.Edit className="h-5 w-5" />
      </button>
      <button
        onClick={onRemove}
        className="text-tertiary hover:text-tertiary-700"
        aria-label={`Remove ${element.name}`}
      >
        <Icons.Trash className="h-5 w-5" />
      </button>
    </div>
  </div>
);

const FactsList: React.FC<{
  facts: string[];
  elementId: string;
  onChange: (facts: string[]) => void;
}> = ({ facts, elementId, onChange }) => {
  const handleAddFact = () => {
    onChange([...facts, ""]);
  };

  const handleFactChange = (index: number, value: string) => {
    const newFacts = [...facts];
    newFacts[index] = value;
    onChange(newFacts);
  };

  const handleRemoveFact = (index: number) => {
    onChange(facts.filter((_, i) => i !== index));
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <div className="flex items-center">
          <h3 className="font-semibold">Facts</h3>
          <InfoIcon
            tooltipText="Three facts about the story element. For NPCs, include their preferred pronouns and motivations."
            position="right"
            className="ml-2 mt-1"
          />
        </div>
        <PrimaryButton
          variant="outline"
          size="sm"
          onClick={handleAddFact}
          leftIcon={<Icons.Plus className="h-4 w-4" />}
        >
          Add
        </PrimaryButton>
      </div>

      {facts.length === 0 ? (
        <Input
          id={`new-fact-${elementId}`}
          name={`new-fact-${elementId}`}
          placeholder="Click + to add facts"
          disabled
        />
      ) : (
        facts.map((fact, factIndex) => (
          <div key={factIndex} className="flex gap-2 mb-2">
            <Input
              id={`element-fact-${elementId}-${factIndex}`}
              name={`element-fact-${elementId}-${factIndex}`}
              className="flex-1"
              value={fact}
              onChange={(e) => handleFactChange(factIndex, e.target.value)}
              placeholder="Enter a fact about this element"
            />
            <button
              type="button"
              onClick={() => handleRemoveFact(factIndex)}
              className="text-tertiary hover:text-tertiary-700"
              aria-label={`Remove fact ${factIndex + 1}`}
            >
              <Icons.Trash className="h-4 w-4" />
            </button>
          </div>
        ))
      )}
    </div>
  );
};

const ElementEditor: React.FC<ElementEditorProps> = ({
  element,
  onSave,
  onRemove,
  onStartEdit,
  isEditing,
}) => {
  const { localElement, setLocalElement } = useStoryElements(element);

  if (!isEditing) {
    return (
      <ElementItem element={element} onEdit={onStartEdit} onRemove={onRemove} />
    );
  }

  const handleSave = () => {
    if (localElement.name && localElement.id) {
      onSave(localElement);
    }
  };

  return (
    <div className="bg-white p-4 rounded-lg shadow mb-4">
      <div className="flex justify-between items-start mb-4">
        <div className="flex-1 space-y-4 mr-4">
          <div className="flex items-center gap-2">
            <span className="font-semibold w-24">Name</span>
            <Input
              id={`element-name-${element.id}`}
              name={`element-name-${element.id}`}
              className="flex-1"
              value={localElement.name}
              onChange={(e) =>
                setLocalElement({ ...localElement, name: e.target.value })
              }
              placeholder="Enter element name"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="font-semibold w-24">ID</span>
            <Input
              id={`element-id-${element.id}`}
              name={`element-id-${element.id}`}
              className="flex-1"
              value={localElement.id}
              onChange={(e) =>
                setLocalElement({ ...localElement, id: e.target.value })
              }
              placeholder="Enter element ID (use underscores, e.g., mr_x)"
            />
          </div>

          <div className="flex items-start gap-2">
            <span className="font-semibold w-24 pt-2">Role</span>
            <TextArea
              id={`element-role-${element.id}`}
              name={`element-role-${element.id}`}
              className="flex-1"
              rows={3}
              value={localElement.role}
              onChange={(e) =>
                setLocalElement({ ...localElement, role: e.target.value })
              }
              placeholder="What can players do with this element? How does it relate to outcomes?"
            />
          </div>

          <div className="flex items-start gap-2">
            <span className="font-semibold w-36 pt-2">Instructions</span>
            <TextArea
              id={`element-instructions-${element.id}`}
              name={`element-instructions-${element.id}`}
              className="flex-1"
              rows={3}
              value={localElement.instructions}
              onChange={(e) =>
                setLocalElement({
                  ...localElement,
                  instructions: e.target.value,
                })
              }
              placeholder="Instructions on how to use this element (narrative and mechanics)"
            />
          </div>

          <FactsList
            facts={localElement.facts}
            elementId={element.id}
            onChange={(facts) => setLocalElement({ ...localElement, facts })}
          />
        </div>

        <div className="flex flex-col gap-2">
          <button
            onClick={onRemove}
            className="text-tertiary hover:text-tertiary-700"
            aria-label="Remove element"
          >
            <Icons.Trash className="h-5 w-5" />
          </button>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <PrimaryButton
          onClick={handleSave}
          disabled={!localElement.name}
          variant="outline"
        >
          Save
        </PrimaryButton>
      </div>
    </div>
  );
};

export const StoryElementsTab: React.FC<StoryElementsTabProps> = ({
  elements,
  onChange,
}) => {
  const {
    editingElements,
    handleAddElement,
    handleUpdateElement,
    handleRemoveElement,
    setEditingElement,
    removeEditingElement,
  } = useStoryElements(elements, onChange);

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
        <PrimaryButton
          variant="outline"
          size="sm"
          onClick={handleAddElement}
          leftIcon={<Icons.Plus className="h-4 w-4" />}
        >
          Add
        </PrimaryButton>
      </div>

      {elements.map((element, index) => (
        <ElementEditor
          key={element.id}
          element={element}
          index={index}
          isEditing={editingElements.has(element.id)}
          onStartEdit={() => setEditingElement(element.id)}
          onSave={(updatedElement) => {
            handleUpdateElement(index, updatedElement);
            removeEditingElement(element.id);
          }}
          onRemove={() => handleRemoveElement(index)}
        />
      ))}
    </div>
  );
};
