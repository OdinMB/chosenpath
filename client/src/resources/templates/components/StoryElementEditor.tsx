import React, { useState, useEffect } from "react";
import {
  StoryElement,
  ImageInstructions,
  ImageUI,
  ImageStatus,
} from "core/types";
import { Input, TextArea } from "components/ui";
import { ArrayField, ExpandableItem } from "components";
import { useImageGeneration } from "../hooks/useImageGeneration";
import { Icons } from "shared/components/ui/Icons";
import { ImagePlaceholder } from "./ImagePlaceholder";
import { ReferenceImageSelector } from "./ReferenceImageSelector";

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
  canGenerateImages?: boolean;
  allElements?: StoryElement[];
  getEffectiveImageId?: (currentId: string) => string;
  pendingImageOperations?: Array<{ type: string; oldId: string; newId: string }>;
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
  canGenerateImages = true,
  allElements,
  getEffectiveImageId,
  pendingImageOperations,
}) => {
  const { generateImageForElement } = useImageGeneration();
  const [imageStatus, setImageStatus] = useState<ImageStatus>("ready");
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedSourceImageIds, setSelectedSourceImageIds] = useState<
    string[]
  >((element as unknown as { sourceImageIds?: string[] }).sourceImageIds || []);

  // Sync selectedSourceImageIds with element prop when it changes
  useEffect(() => {
    const elementSourceIds = (element as unknown as { sourceImageIds?: string[] }).sourceImageIds || [];
    setSelectedSourceImageIds(elementSourceIds);
  }, [element.id, element]); // Update when element ID or element changes

  // Build friendly labels from current element (best-effort). For full mapping, pass all elements to selector.

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
      // Set loading states
      setIsGenerating(true);
      setImageStatus("generating");

      const result = await generateImageForElement({
        templateId,
        element,
        imageInstructions,
        referenceImageIds: selectedSourceImageIds,
      });

      console.log("Image generation completed:", result);

      if (result) {
        setImageStatus("ready");
      } else {
        setImageStatus("failed");
      }
    } catch (error) {
      console.error("Error in handleGenerateImage:", error);
      setImageStatus("failed");
    } finally {
      // Reset loading state
      setIsGenerating(false);
    }
  };

  // Create element image object for StoryImage
  // Use effective image ID to handle pending renames
  const effectiveImageId = getEffectiveImageId ? getEffectiveImageId(element.id) : element.id;
  const elementImage: ImageUI = {
    id: effectiveImageId,
    fileType: "jpeg",
    source: "template",
    sourceId: templateId,
    status: isGenerating ? "generating" : imageStatus,
  };

  // Create element image for the collapsed view
  const elementImageComponent = (
    <div className="relative">
      <ImagePlaceholder
        image={elementImage}
        alt={element.name || "Element"}
        isGenerating={isGenerating}
        canGenerateImages={canGenerateImages && !readOnly}
        hasAppearance={!!element.appearance}
        onGenerateClick={handleGenerateImage}
        size="small"
      />
    </div>
  );

  // Create combined description that includes both role and instructions
  const elementDescription = (
    <div>
      {element.role && <div className="mb-1">{element.role}</div>}
      {element.instructions && <div>{element.instructions}</div>}
    </div>
  );

  const renderElementForm = (
    data: StoryElement,
    onChange: (updatedData: StoryElement) => void
  ) => {
    return (
      <div className="flex-1 space-y-4 mr-4">
        <div className="flex items-center gap-2 flex-col sm:flex-row">
          <span className="font-semibold w-24 self-start sm:self-auto">
            Name
          </span>
          <Input
            id={`element-name-${data.id}`}
            name={`element-name-${data.id}`}
            className="flex-1 w-full"
            value={data.name}
            onChange={(e) => onChange({ ...data, name: e.target.value })}
            placeholder="Enter element name"
            disabled={readOnly}
          />
        </div>

{/* ID field - hidden in production, disabled in development */}
        {import.meta.env.DEV && (
          <div className="flex items-center gap-2 flex-col sm:flex-row">
            <span className="font-semibold w-24 self-start sm:self-auto">ID</span>
            <Input
              id={`element-id-${data.id}`}
              name={`element-id-${data.id}`}
              className="flex-1 w-full bg-gray-100"
              value={data.id}
              onChange={(e) => onChange({ ...data, id: e.target.value })}
              placeholder="Auto-generated from name"
              disabled={true}
              title="ID is automatically generated from the element name"
            />
          </div>
        )}

        <div className="flex items-start gap-2 flex-col sm:flex-row">
          <span className="font-semibold w-24 pt-2 self-start sm:self-auto">
            Role
          </span>
          <TextArea
            id={`element-role-${data.id}`}
            name={`element-role-${data.id}`}
            className="flex-1 w-full"
            autoHeight
            value={data.role}
            onChange={(e) => onChange({ ...data, role: e.target.value })}
            placeholder="What can players do with this element? How does it relate to outcomes?"
            disabled={readOnly}
          />
        </div>

        <div className="flex items-start gap-2 flex-col sm:flex-row">
          <span className="font-semibold w-36 pt-2 self-start sm:self-auto">
            Instructions
          </span>
          <TextArea
            id={`element-instructions-${data.id}`}
            name={`element-instructions-${data.id}`}
            className="flex-1 w-full"
            autoHeight
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

        <div className="flex items-start gap-2 flex-col sm:flex-row">
          <span className="font-semibold w-36 pt-2 self-start sm:self-auto">
            Appearance
          </span>
          <div className="flex-1 w-full space-y-3">
            <TextArea
              id={`element-appearance-${data.id}`}
              name={`element-appearance-${data.id}`}
              className="w-full"
              autoHeight
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
            
            {/* Reference image selector under appearance */}
            <ReferenceImageSelector
              templateId={templateId}
              selectedIds={selectedSourceImageIds}
              onUpdate={(next) => {
                setSelectedSourceImageIds(next);
                onChange({ ...data, sourceImageIds: next });
              }}
              readOnly={readOnly}
              allElements={allElements}
              className="mt-3"
              getEffectiveImageId={getEffectiveImageId}
              pendingImageOperations={pendingImageOperations}
            />
          </div>
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

  const generateImageIcon = {
    icon: isGenerating ? (
      <Icons.Spinner className="h-5 w-5" />
    ) : (
      <Icons.CreateImage className="h-5 w-5" />
    ),
    onClick: handleGenerateImage,
    className: `text-blue-500 hover:text-blue-700 ${
      isGenerating ? "text-blue-500" : ""
    }`,
    ariaLabel: `Generate image for ${element.name}`,
    title: element.appearance
      ? isGenerating
        ? "Generating image..."
        : "Generate an image based on the element's appearance"
      : "Element must have an appearance description to generate an image",
    disabled: isGenerating || !element.appearance || !templateId,
  };

  return (
    <ExpandableItem
      key={element.id}
      id={element.id}
      title={element.name || "Unnamed Element"}
      description={elementDescription}
      image={elementImageComponent}
      data={element}
      editingSet={editingElements}
      setEditing={setEditingElements}
      onDelete={() => onDelete(index)}
      onSave={(updatedElement) => onUpdate(index, updatedElement)}
      renderEditForm={renderElementForm}
      isSaveDisabled={(element) => !element.name || !element.id}
      readOnly={readOnly}
      actionIcons={canGenerateImages && !readOnly ? [generateImageIcon] : []}
    />
  );
};
