import React from "react";
import { Select } from "components/ui";
import { ImageUI, StoryElement } from "core/types";
import { ImagePlaceholder } from "./ImagePlaceholder";
import { AcademyContextButton } from "components";
import { useTemplateImages } from "../hooks/useTemplateImages";
import { Icons } from "shared/components/ui/Icons";

interface ReferenceImageSelectorProps {
  templateId: string;
  selectedIds: string[];
  onUpdate: (nextIds: string[]) => void;
  readOnly?: boolean;
  allElements?: StoryElement[];
  className?: string;
  hideDropdown?: boolean;
}

export const ReferenceImageSelector: React.FC<ReferenceImageSelectorProps> = ({
  templateId,
  selectedIds,
  onUpdate,
  readOnly = false,
  allElements,
  className = "",
  hideDropdown = false,
}) => {
  const { data: templateImagesData } = useTemplateImages(
    templateId,
    !!templateId
  );
  const availableImageIds = (templateImagesData?.images || []).map(
    (img) => img.id
  );

  // Build friendly label map from allElements
  const elementIdToName = React.useMemo(() => {
    const map = new Map<string, string>();
    (allElements || []).forEach((el) => {
      if (el.id && el.name) map.set(el.id, el.name);
    });
    return map;
  }, [allElements]);

  const addId = (id: string) => {
    if (!id) return;
    if (selectedIds.includes(id)) return;
    if (selectedIds.length >= 2) return;
    onUpdate([...selectedIds, id]);
  };

  const removeId = (id: string) => {
    onUpdate(selectedIds.filter((x) => x !== id));
  };

  const renderSelected = () => {
    if (selectedIds.length === 0) return null;
    return (
      <div className="flex flex-wrap gap-3 mt-2">
        {selectedIds.map((id) => {
          const refImage: ImageUI = {
            id,
            source: "template",
            sourceId: templateId,
            fileType: "jpeg",
            status: "ready",
          };
          // Friendly label
          let label = id;
          const friendly = elementIdToName.get(id);
          if (friendly) label = friendly;
          else if (/^player\d+_\d+$/.test(id)) label = "Player image";

          return (
            <div key={id} className="flex items-center gap-2">
              <ImagePlaceholder
                image={refImage}
                alt={id}
                isGenerating={false}
                canGenerateImages={false}
                hasAppearance={true}
                size="small"
                className="border"
              />
              <div
                className="text-sm text-gray-700 max-w-[12rem] truncate"
                title={label}
              >
                {label}
              </div>
              <button
                type="button"
                onClick={() => removeId(id)}
                className="text-red-500 hover:text-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-inset rounded p-1 transition-all duration-200"
                aria-label={`Remove ${id}`}
                title="Remove"
              >
                <Icons.Trash className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className={className}>
      {/* Heading with help button */}
      <div className="flex items-center gap-2 mb-2">
        <span className="font-semibold text-sm">Reference images</span>
        <AcademyContextButton
          mode="icon"
          content={
            <div className="text-sm space-y-2">
              <div className="font-semibold">Using reference images</div>
              <p>
                You can guide image generation by selecting existing images as
                references. This helps keep characters and visual motifs
                consistent across images.
              </p>
              <p>
                For best results, choose reference images that clearly show the
                characters, locations, items, or styles you want to preserve.
              </p>
              <p>
                <em>
                  Fahir (see reference image) is sitting in the Moonshine Bar
                  (see reference image).
                </em>
              </p>
            </div>
          }
        />
      </div>

      <div className="flex items-center gap-2">
        {!hideDropdown && selectedIds.length < 2 && (
          <Select
            value=""
            onChange={(e) => addId(e.target.value)}
            variant="default"
            size="sm"
            className="w-full sm:w-64"
            disabled={readOnly || availableImageIds.length === 0}
          >
            <option value="" disabled>
              Select an image
            </option>
            {availableImageIds.map((id) => {
              const friendly = elementIdToName.get(id);
              const label = friendly
                ? friendly
                : /^player\d+_\d+$/.test(id)
                ? "Player image"
                : id;
              return (
                <option key={id} value={id} disabled={selectedIds.includes(id)}>
                  {label}
                </option>
              );
            })}
          </Select>
        )}
        {!hideDropdown && selectedIds.length >= 2 && (
          <div className="text-sm text-gray-500">
            Only 2 reference images allowed.
          </div>
        )}
      </div>

      {renderSelected()}
    </div>
  );
};
