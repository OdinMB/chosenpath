import React, { useState } from "react";
import { TextArea, PrimaryButton } from "components/ui";
import { Icons } from "components/ui/Icons";
import { ImageInstructions, IMAGE_SIZES, IMAGE_QUALITIES } from "core/types";
import { useImageGeneration } from "shared/hooks/useImageGeneration";
import { API_CONFIG } from "core/config";

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
  const [coverImage, setCoverImage] = useState<string | null>(null);
  const { generateCoverImage, isGenerating, error } = useImageGeneration();

  // Try to load the cover image when the component mounts or templateId changes
  React.useEffect(() => {
    const loadCoverImage = async () => {
      if (!templateId) return;

      // Use a timestamp query parameter to prevent caching
      const timestamp = new Date().getTime();
      // Format the path correctly to match the server's route pattern: /images/templates/:templateId/:path(*)
      const coverImagePath = `${API_CONFIG.DEFAULT_API_URL}/images/templates/${templateId}/cover.jpeg?t=${timestamp}`;

      try {
        // Check if the image exists by making a HEAD request
        const response = await fetch(coverImagePath, { method: "HEAD" });
        if (response.ok) {
          setCoverImage(coverImagePath);
          console.log("Cover image found at:", coverImagePath);
        } else {
          setCoverImage(null);
          console.log(
            "Cover image not found, HEAD request failed:",
            response.status,
            response.statusText
          );
        }
      } catch (err) {
        console.error("Error checking cover image:", err);
        setCoverImage(null);
      }
    };

    loadCoverImage();
  }, [templateId, isGenerating]);

  const handleGenerateCoverImage = async () => {
    if (!templateId || !imageInstructions.coverPrompt) return;

    try {
      const result = await generateCoverImage({
        templateId,
        coverPrompt: imageInstructions.coverPrompt,
        imageInstructions,
        size: IMAGE_SIZES.PORTRAIT,
        quality: IMAGE_QUALITIES.HIGH,
      });

      if (result && result.imagePath) {
        // Update the cover image URL to show the new image
        setCoverImage(`${result.imagePath}?t=${new Date().getTime()}`);
      }
    } catch (err) {
      console.error("Error generating cover image:", err);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col md:flex-row gap-6">
        {/* Cover Image Preview - Made smaller */}
        <div className="w-full md:w-1/3 flex flex-col">
          <h3 className="text-lg font-medium mb-3">Cover Image</h3>
          <div
            className="border border-gray-300 rounded-lg flex items-center justify-center bg-gray-100 overflow-hidden"
            style={{ height: "280px" }}
          >
            {coverImage ? (
              <img
                src={coverImage}
                alt="Cover"
                className="max-h-full max-w-full object-contain"
              />
            ) : (
              <div className="text-center p-4 text-gray-500">
                <Icons.CreateImage className="h-12 w-12 mx-auto mb-2 text-gray-400" />
                <p>No cover image</p>
                <p className="text-sm">Generate one using the prompt</p>
              </div>
            )}
          </div>
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
              disabled={readOnly}
            />

            {error && <div className="text-red-500 text-sm mb-4">{error}</div>}

            {/* Generate Button - Centered */}
            <div className="flex justify-center">
              <PrimaryButton
                onClick={handleGenerateCoverImage}
                disabled={
                  isGenerating ||
                  !imageInstructions.coverPrompt ||
                  readOnly ||
                  !templateId
                }
                isLoading={isGenerating}
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
