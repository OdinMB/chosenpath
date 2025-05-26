import express from "express";
import { v4 as uuidv4 } from "uuid";
import { aiImageGenerator } from "server/images/AIImageGenerator.js";
import { Logger } from "shared/logger.js";
import {
  IMAGE_SIZES,
  IMAGE_QUALITIES,
  ResponseStatus,
  GenerateElementImageRequest,
  GenerateCoverImageRequest,
  GenerateImageResponse,
  ImageInstructions,
} from "core/types/index.js";
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
import { verifyAdmin } from "../users/authMiddleware.js";

const router = express.Router();
const IMAGE_GENERATION_ACTION_TYPE = "imageGeneration";
const MAX_TEXT_LENGTH = 2000;

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
  if (size && !Object.values(IMAGE_SIZES).includes(size as any)) {
    return `Invalid image size provided. Valid sizes are: ${Object.values(
      IMAGE_SIZES
    ).join(", ")}`;
  }
  return null;
};

const validateImageQuality = (quality?: string): string | null => {
  if (quality && !Object.values(IMAGE_QUALITIES).includes(quality as any)) {
    return `Invalid image quality provided. Valid qualities are: ${Object.values(
      IMAGE_QUALITIES
    ).join(", ")}`;
  }
  return null;
};
// --- End Validation Helper Functions ---

/**
 * Generate an image for a story element in a template
 */
router.post(
  "/image-generation/template/element",
  verifyAdmin(),
  async (req, res) => {
    const requestId = req.body.requestId || uuidv4();
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

      const imageId = elementId; // elementId is validated as required

      const imagePath = await aiImageGenerator.generateImageForTemplate(
        imageId,
        templateId,
        appearance,
        imageInstructions,
        undefined,
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
      sendError(
        res,
        "Failed to generate image",
        500,
        requestId,
        error instanceof Error ? error : undefined
      );
    }
  }
);

/**
 * Generate an image for a player identity in a template
 */
router.post(
  "/image-generation/template/player",
  verifyAdmin(),
  async (req, res) => {
    const requestId = req.body.requestId || uuidv4();
    try {
      const rateLimit = checkRateLimitForRequest(
        req,
        IMAGE_GENERATION_ACTION_TYPE
      );
      if (rateLimit.isLimited) {
        return sendRateLimited(res, rateLimit, requestId);
      }

      // TODO: Define GeneratePlayerImageRequest type if available
      const {
        templateId,
        playerSlot,
        identityIndex,
        appearance,
        imageInstructions,
        size,
        quality,
      } = req.body as any;

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
      sendError(
        res,
        "Failed to generate player image",
        500,
        requestId,
        error instanceof Error ? error : undefined
      );
    }
  }
);

/**
 * Generate a cover image for a template
 */
router.post(
  "/image-generation/template/cover",
  verifyAdmin(),
  async (req, res) => {
    const requestId = req.body.requestId || uuidv4();
    try {
      const rateLimit = checkRateLimitForRequest(
        req,
        IMAGE_GENERATION_ACTION_TYPE
      );
      if (rateLimit.isLimited) {
        return sendRateLimited(res, rateLimit, requestId);
      }

      const { templateId, coverPrompt, imageInstructions, size, quality } =
        req.body as GenerateCoverImageRequest;

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

      const imageId = "cover";

      const imagePath = await aiImageGenerator.generateCoverImageForTemplate(
        templateId,
        coverPrompt,
        imageInstructions,
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
      sendError(
        res,
        "Failed to generate cover image",
        500,
        requestId,
        error instanceof Error ? error : undefined
      );
    }
  }
);

export default router;
