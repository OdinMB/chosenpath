import React from "react";
import { ImageInstructions } from "core/types";
import { TextArea, InfoIcon } from "components/ui";
import { CoverImageEditor } from "./CoverImageEditor";

interface MediaTabProps {
  templateId?: string;
  imageInstructions: ImageInstructions;
  setImageInstructions: (updates: Partial<ImageInstructions>) => void;
  readOnly?: boolean;
}

export const MediaTab: React.FC<MediaTabProps> = ({
  templateId = "",
  imageInstructions = {
    visualStyle: "",
    atmosphere: "",
    colorPalette: "",
    settingDetails: "",
    characterStyle: "",
    artInfluences: "",
    coverPrompt: "",
  },
  setImageInstructions,
  readOnly = false,
}) => {
  const handleInstructionChange = (
    key: keyof ImageInstructions,
    value: string
  ) => {
    setImageInstructions({
      ...imageInstructions,
      [key]: value,
    });
  };

  const handleCoverPromptChange = (coverPrompt: string) => {
    handleInstructionChange("coverPrompt", coverPrompt);
  };

  return (
    <div className="space-y-6">
      {/* Cover Image Editor */}
      <div className="mb-6">
        <CoverImageEditor
          templateId={templateId}
          imageInstructions={imageInstructions}
          onUpdateCoverPrompt={handleCoverPromptChange}
          readOnly={readOnly}
        />
      </div>

      {/* Image Generation Instructions */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium">Image Generation Instructions</h3>
        <p className="text-sm text-gray-600">
          These instructions will be used to maintain visual consistency across
          all generated images in the story.
        </p>

        <div className="flex items-start gap-2">
          <span className="font-semibold pt-2">Visual Style</span>
          <InfoIcon
            tooltipText="The primary artistic style for images (e.g., watercolor, pixel art, photorealistic)"
            position="right"
            className="mt-3"
          />
          <TextArea
            id="visual-style"
            name="visual-style"
            value={imageInstructions?.visualStyle || ""}
            onChange={(e) =>
              handleInstructionChange("visualStyle", e.target.value)
            }
            className="flex-1"
            rows={2}
            placeholder="E.g., watercolor, pixel art, photorealistic"
            disabled={readOnly}
          />
        </div>

        <div className="flex items-start gap-2">
          <span className="font-semibold pt-2">Atmosphere</span>
          <InfoIcon
            tooltipText="The mood or emotional tone that should pervade all images"
            position="right"
            className="mt-3"
          />
          <TextArea
            id="atmosphere"
            name="atmosphere"
            value={imageInstructions?.atmosphere || ""}
            onChange={(e) =>
              handleInstructionChange("atmosphere", e.target.value)
            }
            className="flex-1"
            rows={2}
            placeholder="E.g., dark and gritty, light and whimsical"
            disabled={readOnly}
          />
        </div>

        <div className="flex items-start gap-2">
          <span className="font-semibold pt-2">Color Palette</span>
          <InfoIcon
            tooltipText="Key colors or color scheme that should appear consistently"
            position="right"
            className="mt-3"
          />
          <TextArea
            id="color-palette"
            name="color-palette"
            value={imageInstructions?.colorPalette || ""}
            onChange={(e) =>
              handleInstructionChange("colorPalette", e.target.value)
            }
            className="flex-1"
            rows={2}
            placeholder="E.g., muted earth tones, vibrant neon colors"
            disabled={readOnly}
          />
        </div>

        <div className="flex items-start gap-2">
          <span className="font-semibold pt-2">Setting Details</span>
          <InfoIcon
            tooltipText="Essential visual elements of the world that should appear regularly"
            position="right"
            className="mt-3"
          />
          <TextArea
            id="setting-details"
            name="setting-details"
            value={imageInstructions?.settingDetails || ""}
            onChange={(e) =>
              handleInstructionChange("settingDetails", e.target.value)
            }
            className="flex-1"
            rows={2}
            placeholder="E.g., futuristic city with tall glass skyscrapers, ancient ruins"
            disabled={readOnly}
          />
        </div>

        <div className="flex items-start gap-2">
          <span className="font-semibold pt-2">Character Style</span>
          <InfoIcon
            tooltipText="How characters should be consistently depicted"
            position="right"
            className="mt-3"
          />
          <TextArea
            id="character-style"
            name="character-style"
            value={imageInstructions?.characterStyle || ""}
            onChange={(e) =>
              handleInstructionChange("characterStyle", e.target.value)
            }
            className="flex-1"
            rows={2}
            placeholder="E.g., anime-inspired, photorealistic, stylized cartoon"
            disabled={readOnly}
          />
        </div>

        <div className="flex items-start gap-2">
          <span className="font-semibold pt-2">Art Influences</span>
          <InfoIcon
            tooltipText="Artists, art movements, or media styles that should influence the imagery"
            position="right"
            className="mt-3"
          />
          <TextArea
            id="art-influences"
            name="art-influences"
            value={imageInstructions?.artInfluences || ""}
            onChange={(e) =>
              handleInstructionChange("artInfluences", e.target.value)
            }
            className="flex-1"
            rows={2}
            placeholder="E.g., Studio Ghibli, cyberpunk, art nouveau"
            disabled={readOnly}
          />
        </div>
      </div>
    </div>
  );
};
