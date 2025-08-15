import React from "react";
import { StoryElement, ImageInstructions } from "core/types";
import { PrimaryButton, Icons } from "components/ui";
import { AcademyContextCard } from "./AcademyContextCard";
import { AiIterationCard } from "./AiIterationCard";
import { AcademyContextButton } from "components";
import { useStoryElementsEditor } from "../hooks/useStoryElementsEditor";
import { StoryElementEditor } from "./StoryElementEditor";
import { useParams } from "react-router-dom";

interface StoryElementsTabProps {
  elements: StoryElement[];
  onChange?: (elements: StoryElement[]) => void;
  readOnly?: boolean;
  templateId?: string;
  imageInstructions?: ImageInstructions;
  canGenerateImages?: boolean;
  showContextCards?: boolean;
  onRequestElementsIteration?: (
    feedback: string,
    sections: Array<"storyElements"> | Array<string>
  ) => Promise<void> | void;
  isAiIterating?: boolean;
  isSparse?: boolean;
}

export const StoryElementsTab: React.FC<StoryElementsTabProps> = ({
  elements,
  onChange,
  readOnly = false,
  templateId: propTemplateId,
  imageInstructions,
  canGenerateImages = true,
  showContextCards = true,
  onRequestElementsIteration,
  isAiIterating,
  isSparse = false,
}) => {
  // Get templateId from URL if not provided as prop
  const { templateId: urlTemplateId } = useParams<{ templateId: string }>();
  const templateId = propTemplateId || urlTemplateId;

  const {
    editingElements,
    handleAddElement,
    handleUpdateElement,
    handleRemoveElement,
    setEditingElement,
    removeEditingElement,
  } = useStoryElementsEditor(elements, onChange, readOnly);

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

  if (!templateId) {
    console.warn(
      "StoryElementsTab: No templateId provided, image generation will be disabled"
    );
  }

  return (
    <div className="space-y-4">
      {showContextCards && !readOnly && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <AcademyContextCard
            lectureHref="/academy/setting"
            blurb="In addition to characters and locations, you can also define factions, items, rumors, ..."
            blurbShort="Characters, locations, factions, items, rumors, ..."
          />
          <AiIterationCard
            onRequestIteration={async (feedback, sections) => {
              if (onRequestElementsIteration) {
                await onRequestElementsIteration(feedback, sections);
              }
            }}
            templateId={templateId || ""}
            isLoading={Boolean(isAiIterating)}
            placeholder="Instructions"
            placeholderShort="Instructions"
            selectedSections={["storyElements"]}
            buttonText="Improve Elements"
            isSparse={isSparse}
          />
        </div>
      )}
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold">Story Elements</h3>
          <AcademyContextButton
            mode="icon"
            content={
              <div>
                <div className="font-semibold mb-2">Story Elements</div>
                <div className="text-sm mb-2">
                  Story Elements add specific ingredients to your World. You
                  define an initial set, and the AI will add more as the story
                  progresses.
                </div>
                <div className="text-sm mb-2">
                  They can be characters, locations, items, rumors, factions,
                  events, or anything else that matters in your World.
                </div>
                <div className="text-sm mb-2">
                  <em>Example (Gruk):</em> Role: Leader of the largest goblin
                  enclave. Instructions: Can mobilize goblins or provide
                  sanctuary; expects loyalty. Appearance: Broad-shouldered
                  goblin with a missing ear and tattoos. Facts: Has a secret
                  truce with a local hero.
                </div>
                <div className="text-sm">
                  For more information, see the “Story Elements” section of the
                  lecture on "The Setting."
                </div>
              </div>
            }
            link="/academy/setting"
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
        <StoryElementEditor
          key={element.id}
          element={element}
          index={index}
          editingElements={editingElements}
          setEditingElements={setEditingElements}
          onDelete={handleRemoveElement}
          onUpdate={handleUpdateElement}
          readOnly={readOnly}
          templateId={templateId || ""}
          imageInstructions={imageInstructions}
          canGenerateImages={canGenerateImages}
        />
      ))}
    </div>
  );
};
