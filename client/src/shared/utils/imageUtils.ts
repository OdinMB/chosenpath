/**
 * Utility functions for working with images
 */
import { ClientStoryState, PlayerSlot } from "core/types";
import { Image, ImageStatus } from "core/types/image";

/**
 * Creates an image object for use with the StoryImage component
 * @param storyState The current story state
 * @param playerSlot The player slot
 * @param identityChoice The chosen identity index
 * @returns Image object compatible with StoryImage component
 */
export function createPlayerIdentityImage(
  storyState: ClientStoryState,
  playerSlot: PlayerSlot,
  identityChoice: number
): Image {
  return {
    id: `${playerSlot}_${identityChoice}`,
    fileType: "jpeg",
    subDirectory: "players",
    source: storyState.templateId ? "template" : "story",
    status: "ready" as ImageStatus,
  };
}

/**
 * Regular expression for parsing image placeholders in text
 * Format: [image id=image_id source=(template|story) desc="alt text" fileType=(jpeg|png) subDir=optional_directory width=300px]
 */
export const IMAGE_PLACEHOLDER_REGEX = /\[image.*?\]/gs;

/**
 * Parse image placeholder attributes from a matched placeholder string
 * @param placeholderText The full image placeholder text
 * @returns Object with parsed attributes
 */
export function parseImagePlaceholder(
  placeholderText: string
): Record<string, string> {
  const attributes: Record<string, string> = {};

  // Helper function to process and clean description text
  const processDescription = (desc: string): string => {
    // Replace escape sequences
    return desc
      .replace(/\\"/g, '"') // Replace \" with "
      .replace(/\\n/g, "\n") // Replace \n with newline
      .replace(/\\t/g, "\t") // Replace \t with tab
      .trim();
  };

  try {
    // First, clean up the text by removing newlines and extra spaces
    const cleanText = placeholderText
      .replace(/\[image\s+|\]/g, "") // Remove brackets and "image"
      .replace(/\n/g, " ") // Replace newlines with spaces
      .replace(/\s+/g, " ") // Normalize spaces
      .trim(); // Remove leading/trailing spaces

    // Extract id attribute - required
    const idMatch = cleanText.match(/id=([^\s]+)/);
    if (idMatch && idMatch[1]) {
      attributes.id = idMatch[1];
    }

    // Extract source attribute - required
    const sourceMatch = cleanText.match(/source=([^\s]+)/);
    if (sourceMatch && sourceMatch[1]) {
      attributes.source = sourceMatch[1];
    }

    // Extract description attribute - handle all types of quotes
    // Try to find desc="..." pattern with any quote type
    const descQuotePattern = /desc=(?:"|"|")(.*?)(?:"|"|")/;
    const descQuotedMatch = cleanText.match(descQuotePattern);

    if (descQuotedMatch && descQuotedMatch[1]) {
      attributes.desc = processDescription(descQuotedMatch[1]);
    } else {
      // Then try for unquoted desc=text
      const descUnquotedMatch = cleanText.match(/desc=([^\s]+)/);
      if (descUnquotedMatch && descUnquotedMatch[1]) {
        attributes.desc = processDescription(descUnquotedMatch[1]);
      }
    }

    // Extract fileType attribute
    const fileTypeMatch = cleanText.match(/fileType=([^\s]+)/);
    if (fileTypeMatch && fileTypeMatch[1]) {
      attributes.fileType = fileTypeMatch[1];
    }

    // Extract subDir attribute
    const subDirMatch = cleanText.match(/subDir=([^\s]+)/);
    if (subDirMatch && subDirMatch[1]) {
      attributes.subDir = subDirMatch[1];
    }

    // Extract float attribute (left or right)
    const floatMatch = cleanText.match(/float=([^\s]+)/);
    if (floatMatch && floatMatch[1]) {
      attributes.float = floatMatch[1];
    }

    // Log the extracted attributes for debugging
    console.log("Image placeholder text:", placeholderText);
    console.log("Extracted attributes:", attributes);
  } catch (error) {
    console.error("Error parsing image placeholder:", error);
  }

  // Check if we have minimum required attributes
  if (!attributes.id && !attributes.source) {
    // Try the fallback approach with a different pattern
    try {
      // Look for id= and source= anywhere in the text
      const idMatch = placeholderText.match(/id=([a-zA-Z0-9_]+)/);
      const sourceMatch = placeholderText.match(/source=([a-zA-Z0-9_]+)/);

      if (idMatch && idMatch[1]) attributes.id = idMatch[1];
      if (sourceMatch && sourceMatch[1]) attributes.source = sourceMatch[1];
    } catch (e) {
      console.error("Fallback parsing failed:", e);
    }
  }

  return attributes;
}

/**
 * Creates an Image object from parsed placeholder attributes
 * @param attributes The parsed attributes from an image placeholder
 * @returns An Image object for use with StoryImage component
 */
export function createImageFromPlaceholder(
  attributes: Record<string, string>
): Image | null {
  // Check for required attributes
  if (!attributes.id || !attributes.source) {
    console.error("Image placeholder missing required attributes:", attributes);
    return null;
  }

  // Create the image object
  const image = {
    id: attributes.id,
    fileType: (attributes.fileType || "jpeg") as "jpeg" | "png",
    source: attributes.source as "template" | "story",
    subDirectory: attributes.subDir || undefined,
    status: attributes.status as ImageStatus,
    description: attributes.desc || "",
  };

  return image;
}

/**
 * Find an image in the story's image library
 * @param imageId The ID of the image to find
 * @param storyState The current story state
 * @returns The found image or undefined
 */
export function findImageInLibrary(
  imageId: string,
  storyState: ClientStoryState
): Image | undefined {
  if (!storyState.images || !Array.isArray(storyState.images)) {
    return undefined;
  }

  const foundImage = storyState.images.find((img) => img.id === imageId);
  return foundImage;
}

/**
 * Image file extensions
 */
export const IMAGE_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".svg",
];
