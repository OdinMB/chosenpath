import sharp from "sharp";
import { IMAGE_GENERATION_OUTPUT_COMPRESSION } from "server/config.js";
import { Logger } from "shared/logger.js";

/*
 * Shrinks a generated template cover to the size the library shows.
 * Kept apart from AIImageGenerator so the image-model eval can apply the same
 * resize without constructing the generator (which requires an API key).
 */

/**
 * Resize a template cover from portrait (1024x1536) to a smaller portrait
 * (512x768) for the main page, where multiple covers are shown.
 * Returns the original buffer if resizing fails.
 */
export async function resizeTemplateCover(imageBuffer: Buffer): Promise<Buffer> {
  try {
    Logger.Story.log("Resizing cover image to smaller portrait format");

    // Original: 1024x1536, target height 768px,
    // target width 768 * (1024/1536) = 512px
    const targetWidth = Math.round(768 * (1024 / 1536));
    const targetHeight = 768;

    const resizedBuffer = await sharp(imageBuffer)
      .resize(targetWidth, targetHeight, {
        fit: "inside", // Resize to fit within dimensions, maintaining aspect ratio
        withoutEnlargement: true,
      })
      .jpeg({
        quality: IMAGE_GENERATION_OUTPUT_COMPRESSION,
        progressive: true,
      })
      .toBuffer();

    Logger.Story.log(
      `Cover image resized successfully to ${targetWidth}x${targetHeight}`
    );
    return resizedBuffer;
  } catch (error) {
    Logger.Story.error("Error resizing cover image:", error);
    // Return original buffer if resizing fails
    return imageBuffer;
  }
}
