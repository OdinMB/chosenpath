import fs from "fs";
import path from "path";
import { getStoragePath } from "shared/storageUtils.js";
import { Logger } from "shared/logger.js";

/**
 * Media source type
 */
export type MediaSource = "template" | "story";

/**
 * Saves media file to storage
 * @param mediaId The ID for the media file
 * @param source Source type (template or story)
 * @param sourceId The template or story ID
 * @param mediaBuffer The media file buffer
 * @param mediaType Type of media (images or videos)
 * @param fileExtension File extension (e.g., 'jpeg', 'mp4')
 * @param subDir Optional subdirectory
 * @returns URL path to access the file
 */
export async function saveMediaToFile(
  mediaId: string,
  source: MediaSource,
  sourceId: string,
  mediaBuffer: Buffer,
  mediaType: "images" | "videos",
  fileExtension: string,
  subDir?: string
): Promise<string> {
  try {
    const sourceURLString = source === "template" ? "templates" : "stories";
    const fileName = `${mediaId.replace(/\//g, "_")}.${fileExtension}`;
    const sourceBasePath =
      source === "template"
        ? getStoragePath("templates")
        : getStoragePath("stories");

    const storageDir = path.join(
      sourceBasePath,
      sourceId,
      mediaType,
      subDir || ""
    );

    if (!fs.existsSync(storageDir)) {
      fs.mkdirSync(storageDir, { recursive: true });
      Logger.Story.log(`Created ${source} ${mediaType} directory: ${storageDir}`);
    }

    const filePath = path.normalize(path.join(storageDir, fileName));
    fs.writeFileSync(filePath, mediaBuffer);
    Logger.Story.log(
      `Saved ${mediaType.slice(0, -1)} ${mediaId} to ${source}: ${sourceId} at path: ${filePath}`
    );

    return `/${mediaType}/${sourceURLString}/${sourceId}/${subDir ? `${subDir}/` : ""}${fileName}`;
  } catch (error) {
    Logger.Story.error(
      `Error saving ${mediaType.slice(0, -1)} ${mediaId} to ${source}: ${sourceId}`,
      error
    );
    throw error;
  }
}
