import React from "react";
import { StoryElement, ImageInstructions } from "core/types";
import { Input, TextArea } from "components/ui";
import { ArrayField, ExpandableItem } from "components";
import { useImageGeneration } from "../../../shared/hooks/useImageGeneration";
import { Icons } from "../../../shared/components/ui/Icons";

interface StoryElementEditorProps {
  element: StoryElement;
  index: number;
  editingElements: Set<string>;
  setEditingElements: (updater: (prev: Set<string>) => Set<string>) => void;
  onDelete: (index: number) => void;
  onUpdate: (index: number, updatedElement: StoryElement) => void;
  readOnly?: boolean;
  templateId: string;
  imageInstructions?: ImageInstructions;
}

export const StoryElementEditor: React.FC<StoryElementEditorProps> = ({
  element,
  index,
  editingElements,
  setEditingElements,
  onDelete,
  onUpdate,
  readOnly = false,
  templateId,
  imageInstructions,
}) => {
  const { generateImageForElement, isGenerating } = useImageGeneration();

  const handleGenerateImage = async (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    if (!templateId || !element.appearance) {
      console.error("Missing required parameters for image generation:", {
        templateId,
        appearance: element.appearance,
      });
      return;
    }

    console.log(
      "Starting image generation for element:",
      element.id,
      "in template:",
      templateId
    );

    try {
      const result = await generateImageForElement({
        templateId,
        element,
        imageInstructions,
      });

      console.log("Image generation completed:", result);
    } catch (error) {
      console.error("Error in handleGenerateImage:", error);
    }
  };

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

        <div className="flex items-start gap-2">
          <span className="font-semibold w-36 pt-2">Appearance</span>
          <TextArea
            id={`element-appearance-${data.id}`}
            name={`element-appearance-${data.id}`}
            className="flex-1"
            rows={3}
            value={data.appearance}
            onChange={(e) =>
              onChange({
                ...data,
                appearance: e.target.value,
              })
            }
            placeholder="Description of the element's visual appearance (for NPCs, locations, items)"
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
      actionIcons={[
        {
          icon: <Icons.CreateImage className="h-5 w-5" />,
          onClick: handleGenerateImage,
          className: `text-blue-500 hover:text-blue-700 ${
            isGenerating ? "animate-pulse" : ""
          }`,
          ariaLabel: `Generate image for ${element.name}`,
          title: element.appearance
            ? "Generate an image based on the element's appearance"
            : "Element must have an appearance description to generate an image",
          disabled: isGenerating || !element.appearance || !templateId,
        },
      ]}
    />
  );
};
