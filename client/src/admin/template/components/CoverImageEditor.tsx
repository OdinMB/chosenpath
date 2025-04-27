import React, { useState } from "react";
import { TextArea, PrimaryButton } from "components/ui";
import { Icons } from "components/ui/Icons";
import { ImageInstructions, IMAGE_SIZES, IMAGE_QUALITIES } from "core/types";
import { useImageGeneration } from "shared/hooks/useImageGeneration";
import { ImageWithPlaceholder } from "shared/components/ui/ImageWithPlaceholder";

interface CoverImageEditorProps {
  templateId: string;
  imageInstructions: ImageInstructions;
  onUpdateCoverPrompt: (coverPrompt: string) => void;
  readOnly?: boolean;
}

export const CoverImageEditor: React.FC<CoverImageEditorProps> = ({
  templateId,
  imageInstructions,
  onUpdateCoverPrompt,
  readOnly = false,
}) => {
  const { generateCoverImage, isGenerating, error } = useImageGeneration();
  const [localIsGenerating, setLocalIsGenerating] = useState(false);
  const [imageRefreshKey, setImageRefreshKey] = useState(Date.now());

  const handleGenerateCoverImage = async () => {
    if (!templateId || !imageInstructions.coverPrompt) return;

    try {
      // Set local loading state
      setLocalIsGenerating(true);

      const result = await generateCoverImage({
        templateId,
        coverPrompt: imageInstructions.coverPrompt,
        imageInstructions,
        size: IMAGE_SIZES.PORTRAIT,
        quality: IMAGE_QUALITIES.HIGH,
      });

      console.log("Cover image generated:", result);

      // Force a refresh of the image by updating the key
      setImageRefreshKey(Date.now());
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
        {/* Cover Image Preview - Made smaller */}
        <div className="w-full md:w-1/3 flex flex-col">
          <h3 className="text-lg font-medium mb-3">Cover Image</h3>
          <ImageWithPlaceholder
            templateId={templateId}
            imagePath="cover.jpeg"
            alt="Cover"
            height="280px"
            className="w-full"
            placeholderText="No cover image"
            placeholderSubtext="Generate one using the prompt"
            isLoading={localIsGenerating}
            refreshKey={imageRefreshKey}
            borderRadius="rounded-md"
          />
        </div>

        {/* Cover Prompt Input - Moved lower and reorganized */}
        <div className="w-full md:w-2/3 flex flex-col">
          <h3 className="text-lg font-medium mb-3">Cover Image Prompt</h3>
          <div className="flex flex-col">
            <div className="flex items-start gap-2 mb-2">
              <span className="text-sm text-gray-600">
                Describe what should appear on the cover image. Be specific.
              </span>
            </div>
            <TextArea
              id="cover-prompt"
              name="cover-prompt"
              value={imageInstructions.coverPrompt || ""}
              onChange={(e) => onUpdateCoverPrompt(e.target.value)}
              placeholder="E.g., A mysterious forest at twilight with ancient ruins barely visible through the mist. A cloaked figure stands at a crossroads, their face hidden in shadow."
              className="w-full mb-4"
              rows={5}
              disabled={readOnly || localIsGenerating}
            />

            {error && <div className="text-red-500 text-sm mb-4">{error}</div>}

            {/* Generate Button - Centered */}
            <div className="flex justify-center">
              <PrimaryButton
                onClick={handleGenerateCoverImage}
                disabled={
                  isGenerating ||
                  localIsGenerating ||
                  !imageInstructions.coverPrompt ||
                  readOnly ||
                  !templateId
                }
                isLoading={localIsGenerating}
                leftIcon={<Icons.CreateImage className="h-5 w-5" />}
              >
                Generate Cover Image
              </PrimaryButton>
            </div>
            {!templateId && (
              <p className="text-sm text-amber-600 mt-2 text-center">
                Save the template first to generate a cover image
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
