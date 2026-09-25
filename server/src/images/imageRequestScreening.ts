import type { ImageInstructions } from "core/types/index.js";
import type { ContentCheck } from "../game/services/ContentFilterService.js";
import { Logger } from "shared/logger.js";
import { ImageGenerationError } from "./AIImageGenerator.js";
import { analyzeImageGenerationError } from "./openaiImageClient.js";

/*
 * Screens the text of a template-editor image request (element, portrait,
 * cover) against the prohibited-content rules before it reaches the image
 * model. People type these requests, and they may come with reference images
 * of real people; in-game image prompts are written by the story model from
 * an already screened premise and are not screened again.
 */

export type ImageRequestFilter = {
  isAppropriateImageRequest(
    request: string,
    referenceImageCount: number
  ): Promise<ContentCheck>;
};

/**
 * Resolves when the request may be sent. Otherwise throws an
 * ImageGenerationError the editor already knows how to show: CONTENT_POLICY
 * when a rule is broken, TECHNICAL when the filter could not answer (fails
 * closed). The error info comes from the image service's own classification,
 * so the editor shows its existing messages.
 */
export async function screenImageRequest(
  filter: ImageRequestFilter,
  description: string,
  imageInstructions: ImageInstructions | undefined,
  referenceImageCount: number
): Promise<void> {
  const text = [description, ...Object.values(imageInstructions ?? {})]
    .filter((part) => typeof part === "string" && part.trim().length > 0)
    .join("\n");

  let check: ContentCheck;
  try {
    check = await filter.isAppropriateImageRequest(text, referenceImageCount);
  } catch (error) {
    Logger.Story.error("Image request screening unavailable:", error);
    throw imageGenerationErrorFor(
      Object.assign(new Error("The content filter is unavailable"), {
        status: 503,
      })
    );
  }

  if (!check.isAppropriate) {
    Logger.Story.log(
      `Image request blocked by the content filter: ${check.reason}`
    );
    throw imageGenerationErrorFor(
      Object.assign(new Error("Blocked by the content filter's content policy"), {
        code: "content_policy_violation",
      })
    );
  }
}

function imageGenerationErrorFor(error: Error): ImageGenerationError {
  const info = analyzeImageGenerationError(error);
  return new ImageGenerationError(info.userFriendlyMessage, info);
}
