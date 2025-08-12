import React from "react";
import { ImageInstructions } from "core/types";
import { TextArea, Checkbox, InfoIcon } from "components/ui";
import { CoverImageEditor } from "./CoverImageEditor";

interface MediaTabProps {
  templateId?: string;
  imageInstructions: ImageInstructions;
  setImageInstructions: (instructions: ImageInstructions) => void;
  containsImages: boolean;
  setContainsImages: (contains: boolean) => void;
  canGenerateImages?: boolean;
}

export const MediaTab: React.FC<MediaTabProps> = ({
  templateId,
  imageInstructions,
  setImageInstructions,
  containsImages,
  setContainsImages,
  canGenerateImages = true,
}) => {
  const handleChange = (field: keyof ImageInstructions, value: string) => {
    setImageInstructions({
      ...imageInstructions,
      [field]: value,
    });
  };

  return (
    <div className="space-y-6">
      {/* Contains Images */}
      <div className="bg-white p-6 rounded-lg border border-gray-200">
        <div className="flex items-center">
          <Checkbox
            id="contains-images"
            checked={containsImages}
            onChange={(e) => setContainsImages(e.target.checked)}
            disabled={!canGenerateImages}
          />
          <label
            htmlFor="contains-images"
            className={`ml-2 text-sm font-medium ${
              !canGenerateImages ? "text-gray-400" : ""
            }`}
          >
            Use the pre-generated images in stories
          </label>
          <InfoIcon
            tooltipText={
              canGenerateImages
                ? "Check this if the template contains images that should be used during gameplay."
                : "You don't have permission to use images in templates."
            }
            position="right"
            className="ml-2"
          />
        </div>
        {!canGenerateImages && (
          <p className="text-sm text-gray-500 mt-2">
            You need the templates_images permission to use images in templates.
          </p>
        )}
      </div>

      <div className="bg-white p-6 rounded-lg border border-gray-200">
        <h3 className="text-lg font-semibold mb-4">Cover Image</h3>

        <CoverImageEditor
          templateId={templateId}
          imageInstructions={imageInstructions}
          coverPrompt={imageInstructions.coverPrompt || ""}
          onCoverPromptChange={(value) => handleChange("coverPrompt", value)}
          canGenerateImages={canGenerateImages}
        />
      </div>

      <div className="bg-white p-6 rounded-lg border border-gray-200">
        <h3 className="text-lg font-semibold mb-4">
          Image Generation Instructions
        </h3>
        <p className="text-sm text-gray-600 mb-6">
          These instructions will be used to generate images for all story
          elements and character identities. Be specific about the visual style
          you want.
        </p>

        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Visual Style
            </label>
            <TextArea
              value={imageInstructions.visualStyle || ""}
              onChange={(e) => handleChange("visualStyle", e.target.value)}
              placeholder="Describe the overall visual style (e.g., 'digital painting', 'watercolor', 'comic book style')"
              autoHeight
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Atmosphere & Mood
            </label>
            <TextArea
              value={imageInstructions.atmosphere || ""}
              onChange={(e) => handleChange("atmosphere", e.target.value)}
              placeholder="Describe the atmosphere (e.g., 'dark and foreboding', 'bright and hopeful')"
              autoHeight
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Color Palette
            </label>
            <TextArea
              value={imageInstructions.colorPalette || ""}
              onChange={(e) => handleChange("colorPalette", e.target.value)}
              placeholder="Describe your color palette (e.g., 'muted earth tones', 'vibrant primary colors')"
              autoHeight
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Setting Details
            </label>
            <TextArea
              value={imageInstructions.settingDetails || ""}
              onChange={(e) => handleChange("settingDetails", e.target.value)}
              placeholder="Describe setting details to include in images (e.g., 'Victorian architecture', 'futuristic cityscapes')"
              autoHeight
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Character Style
            </label>
            <TextArea
              value={imageInstructions.characterStyle || ""}
              onChange={(e) => handleChange("characterStyle", e.target.value)}
              placeholder="Describe character style (e.g., 'realistic proportions', 'stylized anime characters')"
              autoHeight
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Art Influences
            </label>
            <TextArea
              value={imageInstructions.artInfluences || ""}
              onChange={(e) => handleChange("artInfluences", e.target.value)}
              placeholder="List artistic influences (e.g., 'Studio Ghibli', 'Art Nouveau', 'cyberpunk aesthetics')"
              autoHeight
            />
          </div>
        </div>
      </div>
    </div>
  );
};
