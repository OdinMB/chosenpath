/**
 * Utility functions for working with images
 */
import {
  ClientStoryState,
  ImageUI,
  ImagePlaceholder,
  ImageStoryState,
  ImageStatus,
  ImageSource,
  PlayerSlot,
  ImageReference,
} from "core/types";
import { API_CONFIG } from "core/config";

/**
 * Creates an image object for use with the StoryImage component
 * @param playerSlot The player slot (e.g., "player1", "player2")
 * @param identityChoice The chosen identity index
 * @param imageSource The source of the image (template or story)
 * @param sourceId The source ID (template ID or story ID)
 * @returns Image object compatible with StoryImage component
 */
export function createPlayerIdentityImage(
  playerSlot: PlayerSlot,
  identityChoice: number,
  imageSource: ImageSource,
  sourceId: string,
  description?: string
): ImageUI {
  return {
    id: `${playerSlot}_${identityChoice}`,
    source: imageSource,
    subDirectory: "players",
    sourceId: sourceId,
    description: description || "",
    fileType: "jpeg",
    status: "ready" as ImageStatus,
  } as ImageUI;
}

/**
 * Constructs a URL for an image based on its reference
 * @param imageRef The image reference
 * @param preventCache Whether to add a timestamp to prevent caching (default: true)
 * @returns The complete URL for the image
 */
export function constructImageUrl(
  imageRef: ImageReference,
  preventCache: boolean = true
): string {
  if (!imageRef || !imageRef.sourceId) return "";

  const { id, source, sourceId, subDirectory, fileType } = imageRef;
  const baseUrl = API_CONFIG.DEFAULT_API_URL;
  const cacheParam = preventCache ? `?t=${Date.now()}` : "";

  if (source === "template") {
    return `${baseUrl}/images/templates/${sourceId}${
      subDirectory ? `/${subDirectory}` : ""
    }/${id}.${fileType}${cacheParam}`;
  } else if (source === "story") {
    return `${baseUrl}/images/stories/${sourceId}${
      subDirectory ? `/${subDirectory}` : ""
    }/${id}.${fileType}${cacheParam}`;
  }

  return "";
}

/**
 * Loads an image based on its reference
 * @param imageRef The image reference
 * @param preventCache Whether to add a timestamp to prevent caching (default: true)
 * @returns Promise that resolves to the image URL if it exists, null otherwise
 */
export async function loadImage(
  imageRef: ImageReference,
  preventCache: boolean = true
): Promise<string | null> {
  if (!imageRef || !imageRef.sourceId) return null;

  const imageUrl = constructImageUrl(imageRef, preventCache);

  try {
    // Check if the image exists
    const response = await fetch(imageUrl, { method: "HEAD" });
    if (response.ok) {
      return imageUrl;
    } else {
      return null;
    }
  } catch (err) {
    console.error("Error checking image:", err);
    return null;
  }
}

/**
 * Loads a template cover image
 * @param templateId The ID of the template
 * @returns Promise that resolves to the cover image URL if it exists, null otherwise
 */
export async function loadTemplateCoverImage(
  templateId: string
): Promise<string | null> {
  if (!templateId) return null;

  const coverImageRef: ImageReference = {
    id: "cover",
    source: "template",
    sourceId: templateId,
    fileType: "jpeg",
  };

  return loadImage(coverImageRef);
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
): ImagePlaceholder {
  const placeholder: ImagePlaceholder = {
    id: "",
    source: "template",
    desc: "",
    fileType: "jpeg",
    subDir: "",
    float: "left",
  };

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
      placeholder.id = idMatch[1];
    }

    // Extract source attribute - required
    const sourceMatch = cleanText.match(/source=([^\s]+)/);
    if (sourceMatch && sourceMatch[1]) {
      placeholder.source = sourceMatch[1] as ImageSource;
    }

    // Extract description attribute - handle all types of quotes
    // Try to find desc="..." pattern with any quote type
    const descQuotePattern = /desc=(?:"|"|")(.*?)(?:"|"|")/;
    const descQuotedMatch = cleanText.match(descQuotePattern);

    if (descQuotedMatch && descQuotedMatch[1]) {
      placeholder.desc = processDescription(descQuotedMatch[1]);
    } else {
      // Then try for unquoted desc=text
      const descUnquotedMatch = cleanText.match(/desc=([^\s]+)/);
      if (descUnquotedMatch && descUnquotedMatch[1]) {
        placeholder.desc = processDescription(descUnquotedMatch[1]);
      }
    }

    // Extract fileType attribute
    const fileTypeMatch = cleanText.match(/fileType=([^\s]+)/);
    if (fileTypeMatch && fileTypeMatch[1]) {
      placeholder.fileType = fileTypeMatch[1] as "jpeg" | "png";
    }

    // Extract subDir attribute
    const subDirMatch = cleanText.match(/subDir=([^\s]+)/);
    if (subDirMatch && subDirMatch[1]) {
      placeholder.subDir = subDirMatch[1];
    }

    // Extract float attribute (left or right)
    const floatMatch = cleanText.match(/float=([^\s]+)/);
    if (floatMatch && floatMatch[1]) {
      placeholder.float = floatMatch[1] as "left" | "right";
    }

    // Log the extracted attributes for debugging
    // console.log("Image placeholder text:", placeholderText);
    // console.log("Extracted attributes:", placeholder);
  } catch (error) {
    console.error("Error parsing image placeholder:", error);
  }

  // Check if we have minimum required attributes
  if (!placeholder.id && !placeholder.source) {
    // Try the fallback approach with a different pattern
    try {
      // Look for id= and source= anywhere in the text
      const idMatch = placeholderText.match(/id=([a-zA-Z0-9_]+)/);
      const sourceMatch = placeholderText.match(/source=([a-zA-Z0-9_]+)/);

      if (idMatch && idMatch[1]) placeholder.id = idMatch[1];
      if (sourceMatch && sourceMatch[1])
        placeholder.source = sourceMatch[1] as ImageSource;
    } catch (e) {
      console.error("Fallback parsing failed:", e);
    }
  }

  return placeholder;
}

/**
 * Creates an Image object from parsed placeholder attributes
 * @param attributes The parsed attributes from an image placeholder
 * @returns An Image object for use with StoryImage component
 */
export function createImageFromPlaceholder(
  placeholder: ImagePlaceholder,
  storyState: ClientStoryState
): ImageUI | null {
  // Check for required attributes
  if (!placeholder.id || !placeholder.source) {
    console.error(
      "Image placeholder missing required attributes:",
      placeholder
    );
    return null;
  }

  if (placeholder.source !== "story" && placeholder.source !== "template") {
    console.error("Invalid image source:", placeholder.source);
    return null;
  }

  const sourceId =
    placeholder.source === "template" ? storyState.templateId : storyState.id;

  if (!sourceId) {
    console.error("Invalid " + placeholder.source + " ID:", sourceId);
    return null;
  }

  // player images get special treatment
  if (placeholder.id.startsWith("player")) {
    const playerIdentity =
      storyState.players[placeholder.id as PlayerSlot].identityChoice;
    return createPlayerIdentityImage(
      placeholder.id as PlayerSlot,
      playerIdentity,
      placeholder.source as ImageSource,
      sourceId,
      placeholder.desc
    );
  }

  // Create the image object
  const image = {
    id: placeholder.id,
    source: placeholder.source as "template" | "story",
    sourceId: sourceId || undefined,
    subDirectory: undefined,
    description: placeholder.desc,
    fileType: (placeholder.fileType || "jpeg") as "jpeg" | "png",
    status: "ready" as ImageStatus,
  } as ImageUI;

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
): ImageStoryState | undefined {
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
