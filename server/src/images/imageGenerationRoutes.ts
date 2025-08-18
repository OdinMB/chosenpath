import express from "express";
import { v4 as uuidv4 } from "uuid";
import {
  aiImageGenerator,
  ImageGenerationError,
} from "server/images/AIImageGenerator.js";
import { Logger } from "shared/logger.js";
import {
  IMAGE_SIZES,
  IMAGE_QUALITIES,
  ResponseStatus,
  GenerateElementImageRequest,
  GenerateCoverImageRequest,
  GenerateImageResponse,
  ImageInstructions,
  ImageSize,
  ImageQuality,
  ClientRequest,
  ImageGenerationErrorResponse,
} from "core/types/index.js";

// Request interface for player image generation
interface GeneratePlayerImageRequest extends ClientRequest {
  templateId: string;
  playerSlot: string;
  identityIndex: number;
  appearance: string;
  imageInstructions?: ImageInstructions;
  size?: ImageSize;
  quality?: ImageQuality;
}
import {
  IMAGE_GENERATION_TEMPLATE_COVER_QUALITY,
  IMAGE_GENERATION_TEMPLATE_ELEMENT_QUALITY,
  IMAGE_GENERATION_TEMPLATE_PLAYER_QUALITY,
} from "config.js";
import {
  checkRateLimitForRequest,
  incrementRateLimitForRequest,
} from "../shared/rateLimiter.js";
import { sendRateLimited, sendError } from "../shared/responseUtils.js";
import { verifyUser, checkPermissions } from "../users/authMiddleware.js";

const router = express.Router();
const IMAGE_GENERATION_ACTION_TYPE = "imageGeneration";
const MAX_TEXT_LENGTH = 2000;

// Helper function to send image generation errors with structured information
const sendImageGenerationError = (
  res: express.Response,
  error: Error,
  requestId?: string
): void => {
  if (error instanceof ImageGenerationError) {
    // Determine appropriate HTTP status code based on error type
    let statusCode = 400; // Default to Bad Request for business logic errors

    // Use 500 only for actual technical failures
    if (error.imageGenerationError.errorCode === "TECHNICAL") {
      statusCode = 500;
    } else if (error.imageGenerationError.errorCode === "RATE_LIMIT") {
      statusCode = 429; // Too Many Requests
    }

    // Send structured error information for image generation errors
    const response: ImageGenerationErrorResponse = {
      status:
        statusCode === 400 ? ResponseStatus.INVALID : ResponseStatus.ERROR,
      requestId: requestId || uuidv4(),
      timestamp: Date.now(),
      errorMessage: error.imageGenerationError.userFriendlyMessage,
      operationType: res.req?.originalUrl?.split("?")[0],
      imageGenerationError: error.imageGenerationError,
    };

    Logger.Story.log(
      `Image generation error [${response.requestId}] (${statusCode}) - ${error.imageGenerationError.errorCode}: ${error.imageGenerationError.technicalMessage}`
    );

    res.status(statusCode).json(response);
  } else {
    // Fall back to regular error handling for non-image generation errors
    sendError(res, error.message, 500, requestId, error);
  }
};

// --- Validation Helper Functions ---
const validateStringInput = (
  value: string | undefined,
  fieldName: string,
  maxLength: number,
  required: boolean = true
): string | null => {
  if (
    required &&
    (value === undefined || value === null || value.trim() === "")
  ) {
    return `${fieldName} is required.`;
  }
  if (value && value.length > maxLength) {
    return `${fieldName} exceeds maximum length of ${maxLength} characters.`;
  }
  return null;
};

const validateImageInstructions = (
  imageInstructions?: ImageInstructions
): string | null => {
  if (!imageInstructions) {
    return null;
  }
  for (const key in imageInstructions) {
    if (Object.prototype.hasOwnProperty.call(imageInstructions, key)) {
      const value = imageInstructions[key as keyof ImageInstructions];
      const error = validateStringInput(
        value,
        `Image instruction '${key}'`,
        MAX_TEXT_LENGTH,
        false
      );
      if (error) return error;
    }
  }
  return null;
};

const validateImageSize = (size?: string): string | null => {
  if (size && !Object.values(IMAGE_SIZES).includes(size as ImageSize)) {
    return `Invalid image size provided. Valid sizes are: ${Object.values(
      IMAGE_SIZES
    ).join(", ")}`;
  }
  return null;
};

const validateImageQuality = (quality?: string): string | null => {
  if (
    quality &&
    !Object.values(IMAGE_QUALITIES).includes(quality as ImageQuality)
  ) {
    return `Invalid image quality provided. Valid qualities are: ${Object.values(
      IMAGE_QUALITIES
    ).join(", ")}`;
  }
  return null;
};
// --- End Validation Helper Functions ---

// Helper to sanitize and map reference ids to template-scoped ImageReference objects
const mapTemplateReferences = (
  templateId: string,
  referenceImageIds?: unknown
) => {
  const safeIds: string[] = Array.isArray(referenceImageIds)
    ? referenceImageIds
        .filter((v) => typeof v === "string" && v.trim().length > 0)
        .slice(0, 2)
    : [];
  return safeIds.map((id) => ({
    id,
    source: "template" as const,
    sourceId: templateId,
    subDirectory: id.startsWith("player") ? "players" : undefined,
    fileType: "jpeg" as const,
  }));
};

/**
 * Generate an image for a story element in a template
 */
router.post(
  "/image-generation/template/element",
  verifyUser(),
  checkPermissions(["templates_images"]),
  async (req, res) => {
    const requestId = req.body.requestId || uuidv4();
    Logger.Story.log(
      `Image generation request from user: ${req.user?.username} (${
        req.user?.id
      }) with permissions: ${req.userPermissions?.join(", ")}`
    );
    try {
      const rateLimit = checkRateLimitForRequest(
        req,
        IMAGE_GENERATION_ACTION_TYPE
      );
      if (rateLimit.isLimited) {
        return sendRateLimited(res, rateLimit, requestId);
      }

      const {
        templateId,
        elementId,
        appearance,
        imageInstructions,
        referenceImageIds,
        size,
        quality,
      } = req.body as GenerateElementImageRequest;

      // Input Validation
      let validationError = validateStringInput(templateId, "templateId", 255);
      if (validationError)
        return sendError(res, validationError, 400, requestId);
      validationError = validateStringInput(elementId, "elementId", 255);
      if (validationError)
        return sendError(res, validationError, 400, requestId);
      validationError = validateStringInput(
        appearance,
        "appearance",
        MAX_TEXT_LENGTH
      );
      if (validationError)
        return sendError(res, validationError, 400, requestId);
      validationError = validateImageInstructions(imageInstructions);
      if (validationError)
        return sendError(res, validationError, 400, requestId);
      validationError = validateImageSize(size);
      if (validationError)
        return sendError(res, validationError, 400, requestId);
      validationError = validateImageQuality(quality);
      if (validationError)
        return sendError(res, validationError, 400, requestId);

      // Build references (optional, up to 2)
      const references = mapTemplateReferences(templateId, referenceImageIds);

      const imageId = elementId; // elementId is validated as required

      const imagePath = await aiImageGenerator.generateImageForTemplate(
        imageId,
        templateId,
        appearance,
        imageInstructions,
        references.length ? references : undefined,
        size,
        quality || IMAGE_GENERATION_TEMPLATE_ELEMENT_QUALITY
      );

      incrementRateLimitForRequest(req, IMAGE_GENERATION_ACTION_TYPE);

      return res.status(200).json({
        status: ResponseStatus.SUCCESS,
        requestId,
        timestamp: Date.now(),
        data: { imageId, imagePath } as GenerateImageResponse,
      });
    } catch (error) {
      Logger.Story.error("Error generating image for template element:", error);
      sendImageGenerationError(
        res,
        error instanceof Error ? error : new Error(String(error)),
        requestId
      );
    }
  }
);

/**
 * Generate an image for a player identity in a template
 */
router.post(
  "/image-generation/template/player",
  verifyUser(),
  checkPermissions(["templates_images"]),
  async (req, res) => {
    const requestId = req.body.requestId || uuidv4();
    Logger.Story.log(
      `Player image generation request from user: ${req.user?.username} (${
        req.user?.id
      }) with permissions: ${req.userPermissions?.join(", ")}`
    );
    try {
      const rateLimit = checkRateLimitForRequest(
        req,
        IMAGE_GENERATION_ACTION_TYPE
      );
      if (rateLimit.isLimited) {
        return sendRateLimited(res, rateLimit, requestId);
      }

      const {
        templateId,
        playerSlot,
        identityIndex,
        appearance,
        imageInstructions,
        size,
        quality,
      } = req.body as GeneratePlayerImageRequest;

      // Input Validation
      let validationError = validateStringInput(templateId, "templateId", 255);
      if (validationError)
        return sendError(res, validationError, 400, requestId);
      validationError = validateStringInput(playerSlot, "playerSlot", 255);
      if (validationError)
        return sendError(res, validationError, 400, requestId);
      if (identityIndex === undefined || identityIndex === null) {
        return sendError(res, "identityIndex is required.", 400, requestId);
      }
      if (typeof identityIndex !== "number") {
        return sendError(
          res,
          "identityIndex must be a number.",
          400,
          requestId
        );
      }
      validationError = validateStringInput(
        appearance,
        "appearance",
        MAX_TEXT_LENGTH
      );
      if (validationError)
        return sendError(res, validationError, 400, requestId);
      validationError = validateImageInstructions(imageInstructions);
      if (validationError)
        return sendError(res, validationError, 400, requestId);
      validationError = validateImageSize(size);
      if (validationError)
        return sendError(res, validationError, 400, requestId);
      validationError = validateImageQuality(quality);
      if (validationError)
        return sendError(res, validationError, 400, requestId);

      const imagePath = await aiImageGenerator.generatePlayerImageForTemplate(
        playerSlot,
        identityIndex,
        templateId,
        appearance,
        imageInstructions,
        size || IMAGE_SIZES.PORTRAIT,
        quality || IMAGE_GENERATION_TEMPLATE_PLAYER_QUALITY
      );

      incrementRateLimitForRequest(req, IMAGE_GENERATION_ACTION_TYPE);

      return res.status(200).json({
        status: ResponseStatus.SUCCESS,
        requestId,
        timestamp: Date.now(),
        data: {
          imageId: `${playerSlot}_${identityIndex}`,
          imagePath,
        } as GenerateImageResponse,
      });
    } catch (error) {
      Logger.Story.error("Error generating image for player identity:", error);
      sendImageGenerationError(
        res,
        error instanceof Error ? error : new Error(String(error)),
        requestId
      );
    }
  }
);

/**
 * Generate a cover image for a template
 */
router.post(
  "/image-generation/template/cover",
  verifyUser(),
  checkPermissions(["templates_images"]),
  async (req, res) => {
    const requestId = req.body.requestId || uuidv4();
    Logger.Story.log(
      `Cover image generation request from user: ${req.user?.username} (${
        req.user?.id
      }) with permissions: ${req.userPermissions?.join(", ")}`
    );
    try {
      const rateLimit = checkRateLimitForRequest(
        req,
        IMAGE_GENERATION_ACTION_TYPE
      );
      if (rateLimit.isLimited) {
        return sendRateLimited(res, rateLimit, requestId);
      }

      const {
        templateId,
        coverPrompt,
        imageInstructions,
        referenceImageIds,
        size,
        quality,
      } = req.body as GenerateCoverImageRequest;

      // Input Validation
      let validationError = validateStringInput(templateId, "templateId", 255);
      if (validationError)
        return sendError(res, validationError, 400, requestId);
      validationError = validateStringInput(
        coverPrompt,
        "coverPrompt",
        MAX_TEXT_LENGTH
      );
      if (validationError)
        return sendError(res, validationError, 400, requestId);
      validationError = validateImageInstructions(imageInstructions);
      if (validationError)
        return sendError(res, validationError, 400, requestId);
      validationError = validateImageSize(size);
      if (validationError)
        return sendError(res, validationError, 400, requestId);
      validationError = validateImageQuality(quality);
      if (validationError)
        return sendError(res, validationError, 400, requestId);

      // Build references (optional, up to 2)
      const references = mapTemplateReferences(templateId, referenceImageIds);

      const imageId = "cover";

      const imagePath = await aiImageGenerator.generateCoverImageForTemplate(
        templateId,
        coverPrompt,
        imageInstructions,
        references.length ? references : undefined,
        size || IMAGE_SIZES.PORTRAIT,
        quality || IMAGE_GENERATION_TEMPLATE_COVER_QUALITY
      );

      incrementRateLimitForRequest(req, IMAGE_GENERATION_ACTION_TYPE);

      return res.status(200).json({
        status: ResponseStatus.SUCCESS,
        requestId,
        timestamp: Date.now(),
        data: { imageId, imagePath } as GenerateImageResponse,
      });
    } catch (error) {
      Logger.Story.error("Error generating cover image for template:", error);
      sendImageGenerationError(
        res,
        error instanceof Error ? error : new Error(String(error)),
        requestId
      );
    }
  }
);

export default router;
