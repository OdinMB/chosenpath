import React, { useState } from "react";
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
  const [expandedSections, setExpandedSections] = useState<{
    [key: string]: boolean;
  }>({
    visualStyle: true,
    atmosphere: false,
    colorPalette: false,
    settingDetails: false,
    characterStyle: false,
    artInfluences: false,
  });

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

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
          />
          <label htmlFor="contains-images" className="ml-2 text-sm font-medium">
            Contains Images
          </label>
          <InfoIcon
            tooltipText="Check this if the template contains images that should be used during gameplay."
            position="right"
            className="ml-2"
          />
        </div>
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

      {canGenerateImages && (
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <h3 className="text-lg font-semibold mb-4">
            Image Generation Instructions
          </h3>
          <p className="text-sm text-gray-600 mb-4">
            These instructions will be used to generate images for all story
            elements and character identities. Be specific about the visual
            style you want.
          </p>

          <div className="border-t border-gray-200 my-4"></div>

          <div className="space-y-4">
            <div>
              <button
                className="flex items-center justify-between w-full text-left font-medium"
                onClick={() => toggleSection("visualStyle")}
              >
                <span>Visual Style</span>
                <span>{expandedSections.visualStyle ? "−" : "+"}</span>
              </button>
              {expandedSections.visualStyle && (
                <div className="mt-2">
                  <TextArea
                    value={imageInstructions.visualStyle || ""}
                    onChange={(e) =>
                      handleChange("visualStyle", e.target.value)
                    }
                    placeholder="Describe the overall visual style (e.g., 'digital painting', 'watercolor', 'comic book style')"
                    rows={3}
                  />
                </div>
              )}
            </div>

            <div>
              <button
                className="flex items-center justify-between w-full text-left font-medium"
                onClick={() => toggleSection("atmosphere")}
              >
                <span>Atmosphere & Mood</span>
                <span>{expandedSections.atmosphere ? "−" : "+"}</span>
              </button>
              {expandedSections.atmosphere && (
                <div className="mt-2">
                  <TextArea
                    value={imageInstructions.atmosphere || ""}
                    onChange={(e) => handleChange("atmosphere", e.target.value)}
                    placeholder="Describe the atmosphere (e.g., 'dark and foreboding', 'bright and hopeful')"
                    rows={3}
                  />
                </div>
              )}
            </div>

            <div>
              <button
                className="flex items-center justify-between w-full text-left font-medium"
                onClick={() => toggleSection("colorPalette")}
              >
                <span>Color Palette</span>
                <span>{expandedSections.colorPalette ? "−" : "+"}</span>
              </button>
              {expandedSections.colorPalette && (
                <div className="mt-2">
                  <TextArea
                    value={imageInstructions.colorPalette || ""}
                    onChange={(e) =>
                      handleChange("colorPalette", e.target.value)
                    }
                    placeholder="Describe your color palette (e.g., 'muted earth tones', 'vibrant primary colors')"
                    rows={3}
                  />
                </div>
              )}
            </div>

            <div>
              <button
                className="flex items-center justify-between w-full text-left font-medium"
                onClick={() => toggleSection("settingDetails")}
              >
                <span>Setting Details</span>
                <span>{expandedSections.settingDetails ? "−" : "+"}</span>
              </button>
              {expandedSections.settingDetails && (
                <div className="mt-2">
                  <TextArea
                    value={imageInstructions.settingDetails || ""}
                    onChange={(e) =>
                      handleChange("settingDetails", e.target.value)
                    }
                    placeholder="Describe setting details to include in images (e.g., 'Victorian architecture', 'futuristic cityscapes')"
                    rows={3}
                  />
                </div>
              )}
            </div>

            <div>
              <button
                className="flex items-center justify-between w-full text-left font-medium"
                onClick={() => toggleSection("characterStyle")}
              >
                <span>Character Style</span>
                <span>{expandedSections.characterStyle ? "−" : "+"}</span>
              </button>
              {expandedSections.characterStyle && (
                <div className="mt-2">
                  <TextArea
                    value={imageInstructions.characterStyle || ""}
                    onChange={(e) =>
                      handleChange("characterStyle", e.target.value)
                    }
                    placeholder="Describe character style (e.g., 'realistic proportions', 'stylized anime characters')"
                    rows={3}
                  />
                </div>
              )}
            </div>

            <div>
              <button
                className="flex items-center justify-between w-full text-left font-medium"
                onClick={() => toggleSection("artInfluences")}
              >
                <span>Art Influences</span>
                <span>{expandedSections.artInfluences ? "−" : "+"}</span>
              </button>
              {expandedSections.artInfluences && (
                <div className="mt-2">
                  <TextArea
                    value={imageInstructions.artInfluences || ""}
                    onChange={(e) =>
                      handleChange("artInfluences", e.target.value)
                    }
                    placeholder="List artistic influences (e.g., 'Studio Ghibli', 'Art Nouveau', 'cyberpunk aesthetics')"
                    rows={3}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
