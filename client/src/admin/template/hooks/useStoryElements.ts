import { useState } from "react";
import { StoryElement } from "@core/types";

interface UseStoryElementsResult {
  editingElements: Set<string>;
  localElement: StoryElement;
  setLocalElement: (element: StoryElement) => void;
  handleAddElement: () => void;
  handleUpdateElement: (index: number, updates: StoryElement) => void;
  handleRemoveElement: (index: number) => void;
  setEditingElement: (id: string) => void;
  removeEditingElement: (id: string) => void;
}

type SingleElementResult = Pick<
  UseStoryElementsResult,
  "localElement" | "setLocalElement"
>;

// Function overload signatures
export function useStoryElements(element: StoryElement): SingleElementResult;
export function useStoryElements(
  elements: StoryElement[],
  onChange: (elements: StoryElement[]) => void
): UseStoryElementsResult;

// Implementation
export function useStoryElements(
  elementsOrElement: StoryElement[] | StoryElement,
  onChange?: (elements: StoryElement[]) => void
): UseStoryElementsResult | SingleElementResult {
  // Track which elements are being edited
  const [editingElements, setEditingElements] = useState<Set<string>>(
    new Set()
  );

  // Always create both states to avoid conditional hook calls
  const [singleLocalElement, setSingleLocalElement] = useState<StoryElement>(
    !Array.isArray(elementsOrElement)
      ? elementsOrElement
      : {
          id: "",
          name: "",
          role: "",
          instructions: "",
          facts: [],
        }
  );

  const [arrayLocalElement, setArrayLocalElement] = useState<StoryElement>({
    id: "",
    name: "",
    role: "",
    instructions: "",
    facts: [],
  });

  // For single element case (used in ElementEditor)
  if (!Array.isArray(elementsOrElement)) {
    return {
      localElement: singleLocalElement,
      setLocalElement: setSingleLocalElement,
    };
  }

  // For array case (used in main StoryElementsTab)
  const elements = elementsOrElement;

  const handleAddElement = () => {
    if (!onChange) return;

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

  const handleUpdateElement = (index: number, updates: StoryElement) => {
    if (!onChange) return;

    const updated = elements.map((element, i) =>
      i === index ? updates : element
    );
    onChange(updated);
  };

  const handleRemoveElement = (index: number) => {
    if (!onChange) return;

    const updated = elements.filter((_, i) => i !== index);
    onChange(updated);
  };

  const setEditingElement = (id: string) => {
    setEditingElements((prev) => new Set(prev).add(id));
  };

  const removeEditingElement = (id: string) => {
    setEditingElements((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  return {
    editingElements,
    localElement: arrayLocalElement,
    setLocalElement: setArrayLocalElement,
    handleAddElement,
    handleUpdateElement,
    handleRemoveElement,
    setEditingElement,
    removeEditingElement,
  };
}
