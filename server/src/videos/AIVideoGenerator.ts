/*
 * Sora was retired on 2026-09-24 (OpenAI shut down the Videos API, sora-2 and
 * sora-2-pro with no replacement), so the Sora generator was removed.
 * To test video features, implement a new video generator here.
 *
 * Storage (below), serving (the GET routes in videoRoutes.ts), types
 * (core/types/video.ts) and the templates_videos permission are
 * provider-neutral and stay.
 */
import { saveMediaToFile } from "../media/mediaUtils.js";

export const VIDEO_GENERATION_UNAVAILABLE_MESSAGE =
  "Video generation is not available: no video generator is currently implemented.";

export class AIVideoGenerator {
  /**
   * Save video to template directory
   */
  public async saveVideoToTemplate(
    videoId: string,
    templateId: string,
    videoBuffer: Buffer,
    subDir?: string
  ): Promise<string> {
    return saveMediaToFile(
      videoId,
      "template",
      templateId,
      videoBuffer,
      "videos",
      "mp4",
      subDir
    );
  }

  /**
   * Save video to story directory
   */
  public async saveVideoToStory(
    videoId: string,
    storyId: string,
    videoBuffer: Buffer,
    subDir?: string
  ): Promise<string> {
    return saveMediaToFile(
      videoId,
      "story",
      storyId,
      videoBuffer,
      "videos",
      "mp4",
      subDir
    );
  }
}
