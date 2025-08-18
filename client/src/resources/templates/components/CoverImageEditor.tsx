import React, { useState } from "react";
import { TextArea, PrimaryButton } from "components/ui";
import { Icons } from "components/ui/Icons";
import { ImageInstructions, ImageUI, StoryElement } from "core/types";
import { useImageGeneration } from "client/resources/templates/hooks/useImageGeneration";
import { ImagePlaceholder } from "./ImagePlaceholder";
import { ReferenceImageSelector } from "./ReferenceImageSelector";

interface CoverImageEditorProps {
  templateId?: string;
  imageInstructions?: ImageInstructions;
  coverPrompt: string;
  onCoverPromptChange: (value: string) => void;
  readOnly?: boolean;
  canGenerateImages?: boolean;
  coverRefs?: string[];
  onCoverRefsChange?: (ids: string[]) => void;
  allElements?: StoryElement[];
}

export const CoverImageEditor: React.FC<CoverImageEditorProps> = ({
  templateId,
  imageInstructions,
  coverPrompt,
  onCoverPromptChange,
  readOnly = false,
  canGenerateImages = true,
  coverRefs = [],
  onCoverRefsChange,
  allElements,
}) => {
  const { generateCoverImage, isGenerating } = useImageGeneration();
  const [localIsGenerating, setLocalIsGenerating] = useState(false);

  // Create cover image object for StoryImage
  const coverImage: ImageUI = {
    id: "cover",
    fileType: "jpeg",
    source: "template",
    sourceId: templateId || "",
    status: localIsGenerating ? "generating" : "ready",
  };

  const handleGenerateCoverImage = async () => {
    if (!templateId || !imageInstructions?.coverPrompt) return;

    try {
      // Set local loading state
      setLocalIsGenerating(true);

      const result = await generateCoverImage({
        templateId,
        coverPrompt: imageInstructions.coverPrompt,
        imageInstructions,
        referenceImageIds: coverRefs,
      });

      console.log("Cover image generated:", result);
    } catch (err) {
      console.error("Error generating cover image:", err);
    } finally {
      // Reset loading state
      setLocalIsGenerating(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col md:flex-row gap-6">
        {/* Cover Image Preview */}
        <div className="w-full md:w-2/5 flex flex-col">
          <h3 className="text-lg font-medium mb-3">Cover Image</h3>
          <div className="aspect-[2/3] rounded-md overflow-hidden max-w-[320px] w-full mx-auto flex items-center justify-center">
            <ImagePlaceholder
              image={coverImage}
              alt="Cover Image"
              isGenerating={localIsGenerating}
              canGenerateImages={canGenerateImages && !readOnly}
              hasAppearance={!!imageInstructions?.coverPrompt}
              onGenerateClick={handleGenerateCoverImage}
              size="large"
              className="!w-full !h-full !max-w-none"
              imageClassName="w-full h-full object-cover"
              missingContentMessage="Add a cover image prompt to generate an image"
            />
          </div>
        </div>

        {/* Cover Prompt stacked with Reference Selector */}
        <div className="w-full md:w-3/5 flex flex-col">
          <h3 className="text-lg font-medium mb-3">Cover Image Prompt</h3>
          <TextArea
            id="cover-prompt"
            name="cover-prompt"
            value={coverPrompt}
            onChange={(e) => onCoverPromptChange(e.target.value)}
            placeholder="E.g., A mysterious forest at twilight with ancient ruins barely visible through the mist. A cloaked figure stands at a crossroads, their face hidden in shadow."
            className="w-full"
            autoHeight
            minRows={5}
            disabled={readOnly || localIsGenerating}
          />

          <div className="mt-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm">Reference images</span>
              {/* Help icon inline */}
            </div>
            <ReferenceImageSelector
              templateId={templateId || ""}
              selectedIds={coverRefs}
              onUpdate={(ids) => onCoverRefsChange && onCoverRefsChange(ids)}
              readOnly={readOnly}
              allElements={allElements}
            />
          </div>

          {/* Generate Button */}
          {canGenerateImages && (
            <div className="flex justify-center mt-4">
              <PrimaryButton
                onClick={handleGenerateCoverImage}
                disabled={
                  isGenerating ||
                  localIsGenerating ||
                  !imageInstructions?.coverPrompt ||
                  readOnly ||
                  !templateId
                }
                isLoading={localIsGenerating}
                leftIcon={<Icons.CreateImage className="h-5 w-5" />}
              >
                Generate Cover Image
              </PrimaryButton>
            </div>
          )}

          {!canGenerateImages && (
            <p className="text-sm text-amber-600 mt-2 text-center">
              You do not have permission to generate images
            </p>
          )}

          {canGenerateImages && !templateId && (
            <p className="text-sm text-amber-600 mt-2 text-center">
              Save the template first to generate a cover image
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
