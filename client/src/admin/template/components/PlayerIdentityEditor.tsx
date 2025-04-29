import React, { useState } from "react";
import { ExpandableItem } from "components";
import { Input, Select } from "components/ui";
import {
  CharacterIdentity,
  ImageInstructions,
  Image,
  ImageStatus,
} from "core/types";
import { Icons } from "shared/components/ui/Icons";
import { StoryImage } from "shared/components/StoryImage";
import { useImageGeneration } from "shared/hooks/useImageGeneration";
import { createPlayerIdentityImage } from "shared/utils/imageUtils";

interface PlayerIdentityEditorProps {
  identity: CharacterIdentity;
  index: number;
  playerSlot: string;
  editingIdentities: Set<string>;
  setEditingIdentities: (updater: (prev: Set<string>) => Set<string>) => void;
  onDelete: (index: number) => void;
  onUpdate: (index: number, updatedIdentity: CharacterIdentity) => void;
  pronounSets: Array<{
    label: string;
    pronouns: {
      personal: string;
      object: string;
      possessive: string;
      reflexive: string;
    };
  }>;
  readOnly?: boolean;
  templateId: string;
  imageInstructions?: ImageInstructions;
}

export const PlayerIdentityEditor: React.FC<PlayerIdentityEditorProps> = ({
  identity,
  index,
  playerSlot,
  editingIdentities,
  setEditingIdentities,
  onDelete,
  onUpdate,
  pronounSets,
  readOnly = false,
  templateId,
  imageInstructions,
}) => {
  const { generateImageForPlayer, isGenerating: isGeneratingImage } =
    useImageGeneration();
  const [imageStatus, setImageStatus] = useState<ImageStatus>("ready");

  const handleGenerateImage = async (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    if (!templateId || !identity.appearance) {
      console.error("Missing required parameters for image generation:", {
        templateId,
        appearance: identity.appearance,
      });
      return;
    }

    try {
      setImageStatus("generating");

      const result = await generateImageForPlayer({
        templateId,
        playerSlot,
        identity,
        identityIndex: index,
        imageInstructions,
      });

      if (result) {
        console.log("Player image generation completed:", result);
        setImageStatus("ready");
      } else {
        setImageStatus("failed");
      }
    } catch (error) {
      console.error("Error generating player image:", error);
      setImageStatus("failed");
    }
  };

  const renderIdentityForm = (
    data: CharacterIdentity,
    onChange: (updatedData: CharacterIdentity) => void
  ) => {
    return (
      <div className="flex-1 space-y-4">
        <div className="flex justify-between items-center">
          <h4 className="font-medium">Identity {index + 1}</h4>
        </div>

        <div className="flex gap-2">
          <Input
            value={data.name}
            onChange={(e) => onChange({ ...data, name: e.target.value })}
            placeholder="Character name"
            className="flex-1"
            disabled={readOnly}
          />
          <Select
            size="sm"
            className="w-36"
            value={pronounSets.findIndex(
              (set) =>
                set.pronouns.personal === data.pronouns.personal &&
                set.pronouns.object === data.pronouns.object &&
                set.pronouns.possessive === data.pronouns.possessive &&
                set.pronouns.reflexive === data.pronouns.reflexive
            )}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
              onChange({
                ...data,
                pronouns: pronounSets[Number(e.target.value)].pronouns,
              });
            }}
            disabled={readOnly}
          >
            <option value={-1}>Select pronouns...</option>
            {pronounSets.map((set, i) => (
              <option key={i} value={i}>
                {set.label}
              </option>
            ))}
          </Select>
        </div>

        <Input
          value={data.appearance}
          onChange={(e) => onChange({ ...data, appearance: e.target.value })}
          placeholder="Character appearance"
          disabled={readOnly}
        />
      </div>
    );
  };

  // Create character description with pronouns and appearance
  const identityDescription = (
    <div>
      {identity.pronouns && (
        <div className="mb-1">
          <span className="text-sm">Pronouns: </span>
          <span className="text-sm">
            {identity.pronouns.personal}/{identity.pronouns.object}
          </span>
        </div>
      )}
      {identity.appearance && (
        <div className="text-sm">{identity.appearance}</div>
      )}
    </div>
  );

  // Create character image for the collapsed view
  const playerImage: Image = {
    ...createPlayerIdentityImage(playerSlot, index, "template"),
    status: isGeneratingImage ? "generating" : imageStatus,
  };

  const identityImage = (
    <div className="relative">
      <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center">
        <StoryImage
          image={playerImage}
          alt={identity.name || `Character ${index + 1}`}
          sourceId={templateId}
          className="w-full h-full"
          responsivePosition={false}
          objectPosition="center center"
        />
      </div>
    </div>
  );

  return (
    <ExpandableItem
      id={`identity_${index}`}
      title={identity.name || `Identity ${index + 1}`}
      description={identityDescription}
      image={identityImage}
      data={identity}
      editingSet={editingIdentities}
      setEditing={setEditingIdentities}
      onDelete={() => onDelete(index)}
      onSave={(updatedIdentity) => onUpdate(index, updatedIdentity)}
      renderEditForm={renderIdentityForm}
      isSaveDisabled={() => false}
      readOnly={readOnly}
      actionIcons={[
        {
          icon: isGeneratingImage ? (
            <Icons.Spinner className="h-5 w-5" />
          ) : (
            <Icons.CreateImage className="h-5 w-5" />
          ),
          onClick: handleGenerateImage,
          className: `text-blue-500 hover:text-blue-700 ${
            isGeneratingImage ? "text-blue-500" : ""
          }`,
          ariaLabel: `Generate new image for ${
            identity.name || `Identity ${index + 1}`
          }`,
          title: identity.appearance
            ? isGeneratingImage
              ? "Generating image..."
              : "Generate a new image based on the character's appearance"
            : "Character must have an appearance description to generate an image",
          disabled: isGeneratingImage || !identity.appearance || !templateId,
        },
      ]}
    />
  );
};
