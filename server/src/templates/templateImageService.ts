import {
  StoryTemplate,
  ImageStoryState,
  PLAYER_SLOTS,
} from "core/types/index.js";

// Define the types locally since they're in api.ts which might not be accessible from server
interface TemplateImageManifest {
  cover: boolean;
  storyElements: Record<string, boolean>;
  playerIdentities: Record<string, Record<number, boolean>>;
  totalImages: number;
  missingImages: {
    cover: boolean;
    storyElements: string[];
    playerIdentities: Array<{ playerSlot: string; identityIndex: number }>;
  };
}

/**
 * Generates a manifest of required vs available images for a template
 */
export function generateTemplateImageManifest(
  template: StoryTemplate,
  availableImages: ImageStoryState[]
): TemplateImageManifest {
  // Create a set of available image IDs for fast lookup
  const availableImageIds = new Set(availableImages.map((img) => img.id));

  // Debug logging
  console.log(
    `DEBUG: Template ${template.id} - Available image IDs:`,
    Array.from(availableImageIds)
  );

  // Check cover image
  const hasCover = availableImageIds.has("cover");

  // Check story elements with defined appearances
  const storyElementsWithAppearance = (template.storyElements || []).filter(
    (element) => element.id && element.appearance && element.appearance.trim().length > 0
  );

  const storyElements: Record<string, boolean> = {};
  const missingStoryElements: string[] = [];

  storyElementsWithAppearance.forEach((element) => {
    const hasImage = availableImageIds.has(element.id!);
    storyElements[element.id!] = hasImage;

    if (!hasImage) {
      missingStoryElements.push(element.id!);
    }
  });

  // Check player identities with defined appearances
  const playerIdentities: Record<string, Record<number, boolean>> = {};
  const missingPlayerIdentities: Array<{
    playerSlot: string;
    identityIndex: number;
  }> = [];

  PLAYER_SLOTS.forEach((playerSlot) => {
    const playerData = template[playerSlot as keyof StoryTemplate] as
      | {
          possibleCharacterIdentities?: Array<{ appearance?: string }>;
        }
      | undefined;

    if (playerData?.possibleCharacterIdentities) {
      playerIdentities[playerSlot] = {};

      playerData.possibleCharacterIdentities.forEach(
        (identity, index: number) => {
          if (identity.appearance && identity.appearance.trim().length > 0) {
            const imageId = `${playerSlot}_${index}`;
            const hasImage = availableImageIds.has(imageId);
            playerIdentities[playerSlot][index] = hasImage;

            // Debug logging
            console.log(
              `DEBUG: Checking ${playerSlot} identity ${index}: looking for "${imageId}", found: ${hasImage}`
            );

            if (!hasImage) {
              missingPlayerIdentities.push({
                playerSlot,
                identityIndex: index,
              });
            }
          }
        }
      );
    }
  });

  return {
    cover: hasCover,
    storyElements,
    playerIdentities,
    totalImages: availableImages.length,
    missingImages: {
      cover: !hasCover,
      storyElements: missingStoryElements,
      playerIdentities: missingPlayerIdentities,
    },
  };
}

/**
 * Gets the total count of required images for a template when using pregenerated images
 */
export function getRequiredImageCount(template: StoryTemplate): number {
  let count = 1; // Cover image

  // Count story elements with appearances
  const elementsWithAppearance = (template.storyElements || []).filter(
    (element) => element.appearance && element.appearance.trim().length > 0
  );
  count += elementsWithAppearance.length;

  // Count player identities with appearances
  PLAYER_SLOTS.forEach((playerSlot) => {
    const playerData = template[playerSlot as keyof StoryTemplate] as
      | {
          possibleCharacterIdentities?: Array<{ appearance?: string }>;
        }
      | undefined;

    if (playerData?.possibleCharacterIdentities) {
      const identitiesWithAppearance =
        playerData.possibleCharacterIdentities.filter(
          (identity) =>
            identity.appearance && identity.appearance.trim().length > 0
        );
      count += identitiesWithAppearance.length;
    }
  });

  return count;
}
