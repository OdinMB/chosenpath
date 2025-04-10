import React, { useState } from "react";
import { PrimaryButton } from "@components/ui/PrimaryButton";
import { Icons } from "@components/ui/Icons";
import { Input } from "@components/ui/Input";
import { TextArea } from "@components/ui/TextArea";
import { StoryElement } from "@core/types/storyElement";
import { InfoIcon } from "@components/ui/InfoIcon";

interface StoryElementsTabProps {
  elements: StoryElement[];
  onChange: (elements: StoryElement[]) => void;
}

export const StoryElementsTab: React.FC<StoryElementsTabProps> = ({
  elements,
  onChange,
}) => {
  // Track which elements are being edited by their IDs
  const [editingElements, setEditingElements] = useState<Set<string>>(
    new Set()
  );

  const handleAddElement = () => {
    const newElement: StoryElement = {
      id: `element_${Date.now()}`,
      name: "",
      role: "",
      instructions: "",
      facts: [],
    };
    // Start in edit mode
    setEditingElements((prev) => new Set(prev).add(newElement.id));
    onChange([...elements, newElement]);
  };

  const handleUpdateElement = (
    index: number,
    updates: Partial<StoryElement>
  ) => {
    const updated = elements.map((element, i) =>
      i === index ? { ...element, ...updates } : element
    );
    onChange(updated);
  };

  const handleRemoveElement = (index: number) => {
    const updated = elements.filter((_, i) => i !== index);
    onChange(updated);
  };

  const ElementEditor = ({
    element,
    index,
  }: {
    element: StoryElement;
    index: number;
  }) => {
    const isEditing = editingElements.has(element.id);
    const [localElement, setLocalElement] = useState<StoryElement>(element);

    if (!isEditing) {
      return (
        <div className="bg-white p-4 rounded-lg shadow mb-4 flex justify-between items-center">
          <span className="font-medium">
            {element.name || "Unnamed Element"}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() =>
                setEditingElements((prev) => new Set(prev).add(element.id))
              }
              className="text-secondary hover:text-secondary-700"
              aria-label={`Edit ${element.name}`}
            >
              <Icons.Edit className="h-5 w-5" />
            </button>
            <button
              onClick={() => handleRemoveElement(index)}
              className="text-tertiary hover:text-tertiary-700"
              aria-label={`Remove ${element.name}`}
            >
              <Icons.Trash className="h-5 w-5" />
            </button>
          </div>
        </div>
      );
    }

    const handleSave = () => {
      if (localElement.name && localElement.id) {
        handleUpdateElement(index, localElement);
        setEditingElements((prev) => {
          const next = new Set(prev);
          next.delete(element.id);
          return next;
        });
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
                  setLocalElement((prev) => ({ ...prev, name: e.target.value }))
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
                  setLocalElement((prev) => ({ ...prev, id: e.target.value }))
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
                  setLocalElement((prev) => ({ ...prev, role: e.target.value }))
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
                  setLocalElement((prev) => ({
                    ...prev,
                    instructions: e.target.value,
                  }))
                }
                placeholder="Instructions on how to use this element (narrative and mechanics)"
              />
            </div>

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
                  onClick={() => {
                    setLocalElement((prev) => ({
                      ...prev,
                      facts: [...prev.facts, ""],
                    }));
                  }}
                  leftIcon={<Icons.Plus className="h-4 w-4" />}
                >
                  Add
                </PrimaryButton>
              </div>
              {localElement.facts.length === 0 ? (
                <Input
                  id={`new-fact-${element.id}`}
                  name={`new-fact-${element.id}`}
                  placeholder="Click + to add facts"
                  disabled
                />
              ) : (
                localElement.facts.map((fact, factIndex) => (
                  <div key={factIndex} className="flex gap-2 mb-2">
                    <Input
                      id={`element-fact-${element.id}-${factIndex}`}
                      name={`element-fact-${element.id}-${factIndex}`}
                      className="flex-1"
                      value={fact}
                      onChange={(e) => {
                        const newFacts = [...localElement.facts];
                        newFacts[factIndex] = e.target.value;
                        setLocalElement((prev) => ({
                          ...prev,
                          facts: newFacts,
                        }));
                      }}
                      placeholder="Enter a fact about this element"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const newFacts = localElement.facts.filter(
                          (_, i) => i !== factIndex
                        );
                        setLocalElement((prev) => ({
                          ...prev,
                          facts: newFacts,
                        }));
                      }}
                      className="text-tertiary hover:text-tertiary-700"
                      aria-label={`Remove fact ${factIndex + 1}`}
                    >
                      <Icons.Trash className="h-4 w-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <button
              onClick={() => handleRemoveElement(index)}
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
        <ElementEditor key={element.id} element={element} index={index} />
      ))}
    </div>
  );
};
