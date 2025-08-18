import React from "react";
import { ImageInstructions, TemplateIterationSections } from "core/types";
import { TextArea, Checkbox, Icons } from "components/ui";
import { CoverImageEditor } from "./CoverImageEditor";
import { AcademyContextCard } from "./AcademyContextCard";
import { AiIterationCard } from "./AiIterationCard";
import { AcademyContextButton } from "shared/components/AcademyContextButton";
import { useTemplateImages } from "../hooks/useTemplateImages";

interface MediaTabProps {
  templateId?: string;
  imageInstructions: ImageInstructions;
  setImageInstructions: (instructions: ImageInstructions) => void;
  containsImages: boolean;
  setContainsImages: (contains: boolean) => void;
  canGenerateImages?: boolean;
  showContextCards?: boolean;
  isAiIterating?: boolean;
  isSparse?: boolean;
  onRequestMediaIteration?: (
    feedback: string,
    sections: Array<TemplateIterationSections>
  ) => Promise<void> | void;
  readOnly?: boolean;
  hideUsageSection?: boolean;
  coverPromptOnly?: boolean;
}

export const MediaTab: React.FC<MediaTabProps> = ({
  templateId,
  imageInstructions,
  setImageInstructions,
  containsImages,
  setContainsImages,
  canGenerateImages = true,
  showContextCards = true,
  isAiIterating = false,
  isSparse = false,
  onRequestMediaIteration,
  readOnly = false,
  hideUsageSection = false,
  coverPromptOnly = false,
}) => {
  // Get template images data for status display
  const { data: templateImagesData } = useTemplateImages(
    templateId,
    Boolean(templateId && containsImages)
  );
  return (
    <div className="space-y-6">
      {/* Context cards */}
      {showContextCards && !readOnly && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <AcademyContextCard
            lectureHref={""}
            blurb="Instructions will be considered both for images pregenerated in this Worldbuilding menu and images created during gameplay."
            blurbShort="Applies to pregenerated and in-game images."
          />
          <AiIterationCard
            onRequestIteration={async (feedback, sections) => {
              if (onRequestMediaIteration) {
                await onRequestMediaIteration(
                  feedback,
                  sections as Array<TemplateIterationSections>
                );
              }
            }}
            templateId={templateId}
            isLoading={Boolean(isAiIterating)}
            placeholder="Instructions"
            placeholderShort="Instructions"
            selectedSections={["media"]}
            buttonText="Improve Media"
            isSparse={isSparse}
          />
        </div>
      )}

      {/* World Images Usage */}
      {!hideUsageSection && !readOnly && (
        <div className="bg-white p-4 rounded-lg shadow mb-4">
          <div className="flex items-center">
            <Checkbox
              id="contains-images"
              checked={containsImages}
              onChange={(e) => setContainsImages(e.target.checked)}
              disabled={!canGenerateImages}
              className="h-5 w-5 md:h-6 md:w-6"
            />
            <label
              htmlFor="contains-images"
              className={`ml-2 text-base font-medium ${
                !canGenerateImages ? "text-gray-400" : ""
              }`}
            >
              <span className="font-semibold mr-2">
                Use pregenerated images in stories
              </span>
            </label>
            <AcademyContextButton
              mode="icon"
              content={
                <div className="text-sm">
                  <div className="mb-2 font-semibold">
                    Why pregenerate images?
                  </div>
                  <ul className="list-disc ml-5 space-y-1">
                    <li>
                      It gives you control over how player characters and story
                      elements are depicted.
                    </li>
                    <li>
                      It makes running stories with images in your World
                      cheaper.
                    </li>
                    <li>
                      It allows players who don't want to generate new images
                      during gameplay to still see many relevant images.
                    </li>
                  </ul>
                </div>
              }
            />
          </div>
          <div className="mt-3 text-sm text-gray-600">
            <div>If enabled, you must generate</div>
            {containsImages && templateId && templateImagesData ? (
              <ul className="mt-1 space-y-1">
                <li className="flex items-start">
                  {templateImagesData.manifest.cover ? (
                    <Icons.Success className="h-4 w-4 text-green-600 mr-2 mt-0.5 flex-shrink-0" />
                  ) : (
                    <Icons.Error className="h-4 w-4 text-red-600 mr-2 mt-0.5 flex-shrink-0" />
                  )}
                  <span>a cover</span>
                </li>
                <li className="flex items-start">
                  {templateImagesData.manifest.missingImages.playerIdentities
                    .length === 0 ? (
                    <Icons.Success className="h-4 w-4 text-green-600 mr-2 mt-0.5 flex-shrink-0" />
                  ) : (
                    <Icons.Error className="h-4 w-4 text-red-600 mr-2 mt-0.5 flex-shrink-0" />
                  )}
                  <span>images for all player identities</span>
                </li>
                <li className="flex items-start">
                  {templateImagesData.manifest.missingImages.storyElements
                    .length === 0 ? (
                    <Icons.Success className="h-4 w-4 text-green-600 mr-2 mt-0.5 flex-shrink-0" />
                  ) : (
                    <Icons.Error className="h-4 w-4 text-red-600 mr-2 mt-0.5 flex-shrink-0" />
                  )}
                  <span>
                    images for all story elements (that have a defined
                    appearance)
                  </span>
                </li>
              </ul>
            ) : (
              <ul className="list-disc ml-6 mt-1 space-y-1">
                <li>a cover</li>
                <li>images for all player identities</li>
                <li>
                  images for all story elements (that have a defined appearance)
                </li>
              </ul>
            )}
            {/* Show summary if there are missing images */}
            {containsImages &&
              templateId &&
              templateImagesData &&
              (templateImagesData.manifest.missingImages.cover ||
                templateImagesData.manifest.missingImages.storyElements.length >
                  0 ||
                templateImagesData.manifest.missingImages.playerIdentities
                  .length > 0) && (
                <div className="mt-2 text-sm text-gray-500">
                  {templateImagesData.manifest.totalImages} of{" "}
                  {1 + // cover
                    Object.keys(templateImagesData.manifest.storyElements)
                      .length +
                    Object.values(
                      templateImagesData.manifest.playerIdentities
                    ).reduce(
                      (sum: number, identities: Record<number, boolean>) =>
                        sum + Object.keys(identities).length,
                      0
                    )}{" "}
                  required images available
                </div>
              )}
          </div>
          {!canGenerateImages && (
            <p className="text-sm text-amber-600 mt-2">
              You need permission to pregenerate images for your Worlds.
            </p>
          )}
        </div>
      )}

      {/* Image Generation Instructions - Box */}
      <div className="bg-white p-4 rounded-lg shadow">
        <h3 className="font-semibold mb-3">Image generation instructions</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Visual Style
            </label>
            <TextArea
              value={imageInstructions.visualStyle || ""}
              onChange={(e) =>
                setImageInstructions({
                  ...imageInstructions,
                  visualStyle: e.target.value,
                })
              }
              placeholder="digital painting, watercolor, comic book style"
              autoHeight
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Atmosphere & Mood
            </label>
            <TextArea
              value={imageInstructions.atmosphere || ""}
              onChange={(e) =>
                setImageInstructions({
                  ...imageInstructions,
                  atmosphere: e.target.value,
                })
              }
              placeholder="dark and foreboding, bright and hopeful"
              autoHeight
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Color Palette
            </label>
            <TextArea
              value={imageInstructions.colorPalette || ""}
              onChange={(e) =>
                setImageInstructions({
                  ...imageInstructions,
                  colorPalette: e.target.value,
                })
              }
              placeholder="muted earth tones, vibrant primary colors"
              autoHeight
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Setting Details
            </label>
            <TextArea
              value={imageInstructions.settingDetails || ""}
              onChange={(e) =>
                setImageInstructions({
                  ...imageInstructions,
                  settingDetails: e.target.value,
                })
              }
              placeholder="Victorian architecture, futuristic cityscapes"
              autoHeight
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Character Style
            </label>
            <TextArea
              value={imageInstructions.characterStyle || ""}
              onChange={(e) =>
                setImageInstructions({
                  ...imageInstructions,
                  characterStyle: e.target.value,
                })
              }
              placeholder="realistic proportions, stylized anime characters"
              autoHeight
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Art Influences
            </label>
            <TextArea
              value={imageInstructions.artInfluences || ""}
              onChange={(e) =>
                setImageInstructions({
                  ...imageInstructions,
                  artInfluences: e.target.value,
                })
              }
              placeholder="Art Nouveau, cyberpunk aesthetics"
              autoHeight
            />
          </div>
        </div>
      </div>

      {/* Cover Image (boxed) */}
      <div className="bg-white p-4 rounded-lg shadow">
        {coverPromptOnly ? (
          <TextArea
            value={imageInstructions.coverPrompt || ""}
            onChange={(e) =>
              setImageInstructions({
                ...imageInstructions,
                coverPrompt: e.target.value,
              })
            }
            placeholder="Describe your cover image..."
            autoHeight
          />
        ) : (
          <CoverImageEditor
            templateId={templateId}
            imageInstructions={imageInstructions}
            coverPrompt={imageInstructions.coverPrompt || ""}
            onCoverPromptChange={(value) =>
              setImageInstructions({
                ...imageInstructions,
                coverPrompt: value,
              })
            }
            canGenerateImages={canGenerateImages}
          />
        )}
      </div>
    </div>
  );
};
