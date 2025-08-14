import React, { useMemo, useState } from "react";
import { ImageInstructions, ImageUI } from "core/types";
import { TextArea, Checkbox } from "components/ui";
import { CoverImageEditor } from "./CoverImageEditor";
import { ExpandableItem } from "components";
import { ImagePlaceholder } from "./ImagePlaceholder";

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
  const [editingItems, setEditingItems] = useState<Set<string>>(new Set());

  // Collapsed cover image preview (left side)
  const coverImageUi: ImageUI = useMemo(
    () => ({
      id: "cover",
      fileType: "jpeg",
      source: "template",
      sourceId: templateId || "",
      status: "ready",
    }),
    [templateId]
  );

  return (
    <div className="space-y-6">
      {/* World Images Usage */}
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
            <span className="font-semibold">
              Use pregenerated World images in stories
            </span>
          </label>
        </div>
        <div className="mt-3 text-sm text-gray-600">
          <div>If enabled, you must generate</div>
          <ul className="list-disc ml-6 mt-1 space-y-1">
            <li>a cover</li>
            <li> images for all player identities</li>
            <li>
              images for all story elements (except those that don't have a
              defined appearance)
            </li>
          </ul>
        </div>
        {!canGenerateImages && (
          <p className="text-sm text-amber-600 mt-2">
            You need permission to use images in Worlds.
          </p>
        )}
      </div>

      {/* Image Generation Instructions - Expandable */}
      <ExpandableItem<ImageInstructions>
        id="image-instructions"
        title={
          <span className="font-semibold">Image Generation Instructions</span>
        }
        data={imageInstructions}
        editingSet={editingItems}
        setEditing={setEditingItems}
        onDelete={() => {}}
        onSave={(updated) => setImageInstructions(updated)}
        description={(() => {
          const lines: string[] = [];
          if (imageInstructions.visualStyle)
            lines.push(imageInstructions.visualStyle);
          if (imageInstructions.atmosphere)
            lines.push(imageInstructions.atmosphere);
          if (imageInstructions.colorPalette)
            lines.push(imageInstructions.colorPalette);
          if (imageInstructions.settingDetails)
            lines.push(imageInstructions.settingDetails);
          if (imageInstructions.characterStyle)
            lines.push(imageInstructions.characterStyle);
          if (imageInstructions.artInfluences)
            lines.push(imageInstructions.artInfluences);
          if (lines.length === 0) return undefined;
          return (
            <div className="whitespace-pre-line">
              {lines.map((line, idx) => (
                <div key={`instr-${idx}`}>{line}</div>
              ))}
            </div>
          );
        })()}
        renderEditForm={(data, onChange) => (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Visual Style
              </label>
              <TextArea
                value={data.visualStyle || ""}
                onChange={(e) =>
                  onChange({ ...data, visualStyle: e.target.value })
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
                value={data.atmosphere || ""}
                onChange={(e) =>
                  onChange({ ...data, atmosphere: e.target.value })
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
                value={data.colorPalette || ""}
                onChange={(e) =>
                  onChange({ ...data, colorPalette: e.target.value })
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
                value={data.settingDetails || ""}
                onChange={(e) =>
                  onChange({ ...data, settingDetails: e.target.value })
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
                value={data.characterStyle || ""}
                onChange={(e) =>
                  onChange({ ...data, characterStyle: e.target.value })
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
                value={data.artInfluences || ""}
                onChange={(e) =>
                  onChange({ ...data, artInfluences: e.target.value })
                }
                placeholder="Studio Ghibli, Art Nouveau, cyberpunk aesthetics"
                autoHeight
              />
            </div>
          </div>
        )}
      />

      {/* Cover Image - Expandable with image preview on collapsed */}
      <ExpandableItem<ImageInstructions>
        id="cover-image"
        title={<span className="font-semibold">Cover Image</span>}
        data={imageInstructions}
        editingSet={editingItems}
        setEditing={setEditingItems}
        onDelete={() => {}}
        onSave={(updated) => setImageInstructions(updated)}
        image={
          <ImagePlaceholder
            image={coverImageUi}
            alt="Cover"
            isGenerating={false}
            canGenerateImages={!!canGenerateImages}
            hasAppearance={!!imageInstructions.coverPrompt}
            size="large"
            className="!w-20 !h-32 md:!w-24 md:!h-36"
          />
        }
        renderEditForm={(data, onChange) => (
          <CoverImageEditor
            templateId={templateId}
            imageInstructions={data}
            coverPrompt={data.coverPrompt || ""}
            onCoverPromptChange={(value) =>
              onChange({ ...data, coverPrompt: value })
            }
            canGenerateImages={canGenerateImages}
          />
        )}
      />
    </div>
  );
};
