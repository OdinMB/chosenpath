import { toFile } from "openai";
import type {
  ImageEditParamsNonStreaming,
  ImageGenerateParamsNonStreaming,
  ImagesResponse,
} from "openai/resources/images";
import type { Uploadable } from "openai/uploads";
import fs from "fs";
import path from "path";
import { IMAGE_QUALITIES } from "core/types/index.js";
import type {
  ImageGenerationErrorInfo,
  ImageQuality,
  ImageReference,
  ImageSize,
} from "core/types/index.js";
import { IMAGE_GENERATION_OUTPUT_COMPRESSION } from "server/config.js";
import { getStoragePath } from "shared/storageUtils.js";
import { Logger } from "shared/logger.js";

/*
 * Sends one OpenAI Images API request under per-model rules and returns the
 * image bytes with usage. Also turns stored image references into upload
 * files and classifies the API's errors.
 */

/** GPT Image 2.5 accepts at most 16 input images per edit. */
export const MAX_REFERENCE_IMAGES = 16;

/** The part of the OpenAI client this module uses (a real OpenAI instance fits). */
export type ImageApiClient = {
  images: {
    generate(body: ImageGenerateParamsNonStreaming): Promise<ImagesResponse>;
    edit(body: ImageEditParamsNonStreaming): Promise<ImagesResponse>;
  };
};

export type ImageApiRequest = {
  prompt: string;
  model: string;
  quality: ImageQuality;
  size: ImageSize;
  /** Loaded reference images. None (or an empty array) means plain generation. */
  images?: Uploadable[];
};

export type ImageApiUsage = {
  inputTextTokens: number;
  inputImageTokens: number;
  outputTokens: number;
  /** Only set when the API reports cached input tokens. */
  cachedInputTokens?: number;
};

export type ImageApiResult = {
  buffer: Buffer;
  usage?: ImageApiUsage;
  model: string;
  /** The quality actually sent (after any downgrade). */
  quality: ImageQuality;
  /** The size actually sent. */
  size: ImageSize;
  imagesSent: number;
};

const EXTENDED_QUALITIES: ReadonlySet<ImageQuality> = new Set<ImageQuality>([
  IMAGE_QUALITIES.XHIGH,
  IMAGE_QUALITIES.MAX,
]);

/** xhigh and max exist only on GPT Image 2.5. */
export function supportsExtendedQualities(model: string): boolean {
  return model.startsWith("gpt-image-2.5");
}

/** The quality that will actually be sent: xhigh/max become high on older models. */
export function effectiveImageQuality(
  model: string,
  quality: ImageQuality
): ImageQuality {
  return EXTENDED_QUALITIES.has(quality) && !supportsExtendedQualities(model)
    ? IMAGE_QUALITIES.HIGH
    : quality;
}

function resolveQuality(model: string, quality: ImageQuality): ImageQuality {
  const effective = effectiveImageQuality(model, quality);
  if (effective !== quality) {
    Logger.Story.warn(
      `Image quality '${quality}' only exists on gpt-image-2.5 models; sending '${effective}' to ${model}`
    );
  }
  return effective;
}

function capReferenceImages(images: Uploadable[]): Uploadable[] {
  if (images.length <= MAX_REFERENCE_IMAGES) {
    return images;
  }
  Logger.Story.warn(
    `${images.length} reference images requested; sending the first ${MAX_REFERENCE_IMAGES}`
  );
  return images.slice(0, MAX_REFERENCE_IMAGES);
}

function readCachedTokens(details: unknown): number | undefined {
  if (
    details &&
    typeof details === "object" &&
    "cached_tokens" in details &&
    typeof details.cached_tokens === "number"
  ) {
    return details.cached_tokens;
  }
  return undefined;
}

export function mapImageUsage(
  usage: ImagesResponse["usage"]
): ImageApiUsage | undefined {
  if (!usage) {
    return undefined;
  }
  const details = usage.input_tokens_details;
  const mapped: ImageApiUsage = {
    inputTextTokens: details?.text_tokens ?? 0,
    inputImageTokens: details?.image_tokens ?? 0,
    outputTokens: usage.output_tokens,
  };
  const cachedInputTokens = readCachedTokens(details);
  if (cachedInputTokens !== undefined) {
    mapped.cachedInputTokens = cachedInputTokens;
  }
  return mapped;
}

/**
 * Sends one Images API request. Uses images.edit when at least one reference
 * image is supplied, images.generate otherwise. Never sends input_fidelity.
 * Raw SDK errors propagate unchanged (status, code and type stay readable).
 */
export async function requestImage(
  client: ImageApiClient,
  req: ImageApiRequest
): Promise<ImageApiResult> {
  const quality = resolveQuality(req.model, req.quality);
  const images = capReferenceImages(req.images ?? []);

  const baseParams = {
    model: req.model,
    prompt: req.prompt,
    moderation: "low" as const,
    n: 1,
    quality,
    output_format: "jpeg" as const,
    output_compression: IMAGE_GENERATION_OUTPUT_COMPRESSION,
    size: req.size,
  };

  const response =
    images.length > 0
      ? await client.images.edit({
          ...baseParams,
          image: images,
        } as ImageEditParamsNonStreaming)
      : await client.images.generate(
          baseParams as ImageGenerateParamsNonStreaming
        );

  const b64 = response.data?.[0]?.b64_json;
  if (!b64) {
    throw new Error("No image data in response from the Images API");
  }

  return {
    buffer: Buffer.from(b64, "base64"),
    usage: mapImageUsage(response.usage),
    model: req.model,
    quality,
    size: req.size,
    imagesSent: images.length,
  };
}

/**
 * Absolute path of the stored file behind an image reference.
 */
export function getReferenceImagePath(reference: ImageReference): string {
  const imageBaseDir =
    reference.source === "template"
      ? getStoragePath("templates")
      : getStoragePath("stories");
  return path.join(
    imageBaseDir,
    reference.sourceId,
    "images",
    reference.subDirectory || "",
    `${reference.id}.jpeg`
  );
}

/**
 * Loads reference images for image generation. Missing or unreadable files
 * are logged and skipped.
 * @param references: Array of ImageReference objects
 * @returns Array of OpenAI-compatible File objects
 */
export async function loadReferenceImages(
  references: ImageReference[]
): Promise<Uploadable[]> {
  const referenceImages: Uploadable[] = [];
  for (const reference of references) {
    const imagePath = getReferenceImagePath(reference);

    // Check if the file exists
    if (fs.existsSync(imagePath)) {
      try {
        const stream = fs.createReadStream(imagePath);
        const file = await toFile(stream, null, { type: "image/jpeg" });
        referenceImages.push(file);
        Logger.Story.log(`Loaded reference image: ${imagePath}`);
      } catch (error) {
        Logger.Story.error(
          `Reference image found but failed to load: ${imagePath}`,
          error
        );
      }
    } else {
      Logger.Story.warn(`Reference image not found: ${imagePath}`);
    }
  }

  return referenceImages;
}

function readErrorField(error: unknown, field: string): unknown {
  return error && typeof error === "object" && field in error
    ? (error as Record<string, unknown>)[field]
    : undefined;
}

/**
 * Analyzes OpenAI API errors and provides structured error information
 */
export function analyzeImageGenerationError(
  error: unknown,
  prompt?: string
): ImageGenerationErrorInfo {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const rawCode = readErrorField(error, "code");
  const errorCode =
    rawCode === undefined || rawCode === null ? "" : String(rawCode);
  const rawStatus = readErrorField(error, "status");
  const errorStatus = rawStatus === undefined ? undefined : Number(rawStatus);
  const errorType = readErrorField(error, "type");

  // Check for copyright issues first (more specific than general content policy)
  const promptText = prompt?.toLowerCase() || "";
  const isCopyrightRelated =
    promptText.includes("disney") ||
    promptText.includes("elsa") ||
    promptText.includes("frozen") ||
    promptText.includes("marvel") ||
    promptText.includes("star wars") ||
    promptText.includes("pokemon") ||
    promptText.includes("nintendo") ||
    promptText.includes("mickey mouse") ||
    promptText.includes("superman") ||
    promptText.includes("batman") ||
    promptText.includes("spiderman") ||
    errorMessage.toLowerCase().includes("copyright") ||
    errorMessage.toLowerCase().includes("trademark") ||
    errorMessage.toLowerCase().includes("intellectual property");

  // GPT Image 2.5 marks user-correctable failures with this error type.
  // Sending the same request again fails again, so it is never retryable.
  if (errorType === "image_generation_user_error") {
    return {
      errorCode: isCopyrightRelated ? "COPYRIGHT" : "CONTENT_POLICY",
      userFriendlyMessage:
        "The image service rejected this request as it is written",
      technicalMessage: errorMessage,
      guidance:
        "Sending the same request again will fail again. Change the description or the reference images, then try again.",
      retryable: false,
    };
  }

  // Content policy violations (including safety system and moderation blocks)
  const isContentPolicyViolation =
    errorMessage.toLowerCase().includes("content policy") ||
    errorMessage.toLowerCase().includes("content restrictions") ||
    errorMessage.toLowerCase().includes("violates our content policies") ||
    errorMessage.toLowerCase().includes("safety system") ||
    errorMessage.toLowerCase().includes("moderation") ||
    errorCode === "content_policy_violation" ||
    errorCode === "moderation_blocked";

  if (isContentPolicyViolation) {
    // If it's a content policy violation AND likely copyright-related, classify as COPYRIGHT
    if (isCopyrightRelated) {
      return {
        errorCode: "COPYRIGHT",
        userFriendlyMessage:
          "This request involves copyrighted content and was blocked",
        technicalMessage: errorMessage,
        guidance:
          "Avoid specific brand names, celebrity names, or copyrighted characters. Use general descriptions instead.",
        retryable: true,
      };
    }

    // Otherwise, it's a general content policy issue
    return {
      errorCode: "CONTENT_POLICY",
      userFriendlyMessage:
        "Your request was blocked by content safety policies",
      technicalMessage: errorMessage,
      guidance:
        "Try making your description more general and avoid specific names, brands, copyrighted characters, or potentially sensitive content. Focus on general descriptions rather than specific people or entities.",
      retryable: true,
    };
  }

  // Explicit copyright/trademark issues (when not caught by content policy)
  if (isCopyrightRelated) {
    return {
      errorCode: "COPYRIGHT",
      userFriendlyMessage: "This request may involve copyrighted content",
      technicalMessage: errorMessage,
      guidance:
        "Avoid referencing specific brands, characters, celebrities, or copyrighted works. Instead, describe general visual styles or create original content inspired by but not copying existing works.",
      retryable: true,
    };
  }

  // Rate limiting
  if (
    errorMessage.toLowerCase().includes("rate limit") ||
    errorMessage.toLowerCase().includes("too many requests") ||
    errorStatus === 429 ||
    errorCode === "rate_limit_exceeded"
  ) {
    return {
      errorCode: "RATE_LIMIT",
      userFriendlyMessage: "Too many image generation requests",
      technicalMessage: errorMessage,
      guidance:
        "Please wait a moment before trying again. You've reached the rate limit for image generation.",
      retryable: true,
    };
  }

  // Technical/API errors
  if (
    (errorStatus !== undefined && errorStatus >= 500) ||
    errorMessage.toLowerCase().includes("internal server error") ||
    errorMessage.toLowerCase().includes("service unavailable")
  ) {
    return {
      errorCode: "TECHNICAL",
      userFriendlyMessage:
        "A technical error occurred with the image generation service",
      technicalMessage: errorMessage,
      guidance: "This is a temporary issue. Please try again in a few moments.",
      retryable: true,
    };
  }

  // Unknown/generic errors
  return {
    errorCode: "UNKNOWN",
    userFriendlyMessage: "An unexpected error occurred during image generation",
    technicalMessage: errorMessage,
    guidance:
      "Please try simplifying your description or try again later. If the problem persists, contact support.",
    retryable: true,
  };
}
