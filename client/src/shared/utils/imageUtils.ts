/**
 * Utility functions for working with images
 */
import { API_CONFIG } from "core/config";

/**
 * Get a template image URL
 * This uses the API server directly rather than proxying through the frontend server
 *
 * @param templateId - The ID of the template
 * @param imageName - The name of the image file
 * @returns The complete URL to the image
 */
export function getTemplateImageUrl(
  templateId: string,
  imageName: string
): string {
  // Use the proper API host from core config
  return `${API_CONFIG.DEFAULT_API_URL}/images/templates/${templateId}/${imageName}`;
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
