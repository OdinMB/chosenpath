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

// Helper function to create an empty story element
function createEmptyStoryElement(): StoryElement {
  return {
    id: `element_${Date.now()}`,
    name: "",
    role: "",
    instructions: "",
    facts: [],
  };
}

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

  // State for individual element editing mode
  const [singleLocalElement, setSingleLocalElement] = useState<StoryElement>(
    !Array.isArray(elementsOrElement)
      ? elementsOrElement
      : createEmptyStoryElement()
  );

  // State for working with arrays of elements
  const [arrayLocalElement, setArrayLocalElement] = useState<StoryElement>(
    createEmptyStoryElement()
  );

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

    const newElement = createEmptyStoryElement();

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
