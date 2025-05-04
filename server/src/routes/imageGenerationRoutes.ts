import express from "express";
import { v4 as uuidv4 } from "uuid";
import { aiImageGenerator } from "game/services/AIImageGenerator.js";
import { Logger } from "shared/logger.js";
import {
  IMAGE_SIZES,
  ResponseStatus,
  GenerateElementImageRequest,
  GenerateCoverImageRequest,
  GenerateImageResponse,
} from "core/types/index.js";
import {
  IMAGE_GENERATION_TEMPLATE_COVER_QUALITY,
  IMAGE_GENERATION_TEMPLATE_ELEMENT_QUALITY,
  IMAGE_GENERATION_TEMPLATE_PLAYER_QUALITY,
} from "config.js";

const router = express.Router();

/**
 * Generate an image for a story element in a template
 */
router.post("/image-generation/template/element", async (req, res) => {
  try {
    const {
      templateId,
      elementId,
      appearance,
      imageInstructions,
      size,
      quality,
    } = req.body as GenerateElementImageRequest;

    // Basic validation
    if (!templateId || !elementId || !appearance) {
      return res.status(400).json({
        status: ResponseStatus.INVALID,
        requestId: req.body.requestId || uuidv4(),
        timestamp: Date.now(),
        errorMessage:
          "Missing required fields: templateId, elementId, and appearance are required",
      });
    }

    // Generate a unique ID for the image
    const imageId = elementId || uuidv4();

    // Generate the image
    const imagePath = await aiImageGenerator.generateImageForTemplate(
      imageId,
      templateId,
      appearance,
      imageInstructions,
      undefined, // No image references
      size,
      quality || IMAGE_GENERATION_TEMPLATE_ELEMENT_QUALITY
    );

    // Return success response
    return res.status(200).json({
      status: ResponseStatus.SUCCESS,
      requestId: req.body.requestId || uuidv4(),
      timestamp: Date.now(),
      data: {
        imageId,
        imagePath,
      } as GenerateImageResponse,
    });
  } catch (error) {
    Logger.Story.error("Error generating image for template element:", error);
    return res.status(500).json({
      status: ResponseStatus.ERROR,
      requestId: req.body.requestId || uuidv4(),
      timestamp: Date.now(),
      errorMessage: "Failed to generate image",
      operationType: "IMAGE_GENERATION",
    });
  }
});

/**
 * Generate an image for a player identity in a template
 */
router.post("/image-generation/template/player", async (req, res) => {
  try {
    const {
      templateId,
      playerSlot,
      identityIndex,
      appearance,
      imageInstructions,
      size,
      quality,
    } = req.body;

    // Basic validation
    if (
      !templateId ||
      !playerSlot ||
      identityIndex === undefined ||
      !appearance
    ) {
      return res.status(400).json({
        status: ResponseStatus.INVALID,
        requestId: req.body.requestId || uuidv4(),
        timestamp: Date.now(),
        errorMessage:
          "Missing required fields: templateId, playerSlot, identityIndex, and appearance are required",
      });
    }

    // Generate the image
    const imagePath = await aiImageGenerator.generatePlayerImageForTemplate(
      playerSlot,
      identityIndex,
      templateId,
      appearance,
      imageInstructions,
      size || IMAGE_SIZES.PORTRAIT,
      quality || IMAGE_GENERATION_TEMPLATE_PLAYER_QUALITY
    );

    // Return success response
    return res.status(200).json({
      status: ResponseStatus.SUCCESS,
      requestId: req.body.requestId || uuidv4(),
      timestamp: Date.now(),
      data: {
        imageId: `${playerSlot}_${identityIndex}`,
        imagePath,
      } as GenerateImageResponse,
    });
  } catch (error) {
    Logger.Story.error("Error generating image for player identity:", error);
    return res.status(500).json({
      status: ResponseStatus.ERROR,
      requestId: req.body.requestId || uuidv4(),
      timestamp: Date.now(),
      errorMessage: "Failed to generate player image",
      operationType: "PLAYER_IMAGE_GENERATION",
    });
  }
});

/**
 * Generate a cover image for a template
 */
router.post("/image-generation/template/cover", async (req, res) => {
  try {
    const { templateId, coverPrompt, imageInstructions, size, quality } =
      req.body as GenerateCoverImageRequest;

    // Basic validation
    if (!templateId || !coverPrompt) {
      return res.status(400).json({
        status: ResponseStatus.INVALID,
        requestId: req.body.requestId || uuidv4(),
        timestamp: Date.now(),
        errorMessage:
          "Missing required fields: templateId and coverPrompt are required",
      });
    }

    // Generate the cover image - use 'cover' as the imageId
    const imageId = "cover";

    // Generate the image
    const imagePath = await aiImageGenerator.generateCoverImageForTemplate(
      templateId,
      coverPrompt,
      imageInstructions,
      size || IMAGE_SIZES.PORTRAIT,
      quality || IMAGE_GENERATION_TEMPLATE_COVER_QUALITY
    );

    // Return success response
    return res.status(200).json({
      status: ResponseStatus.SUCCESS,
      requestId: req.body.requestId || uuidv4(),
      timestamp: Date.now(),
      data: {
        imageId,
        imagePath,
      } as GenerateImageResponse,
    });
  } catch (error) {
    Logger.Story.error("Error generating cover image for template:", error);
    return res.status(500).json({
      status: ResponseStatus.ERROR,
      requestId: req.body.requestId || uuidv4(),
      timestamp: Date.now(),
      errorMessage: "Failed to generate cover image",
      operationType: "COVER_IMAGE_GENERATION",
    });
  }
});

export default router;
