import express from "express";
import { v4 as uuidv4 } from "uuid";
import { aiImageGenerator } from "../game/services/AIImageGenerator.js";
import { Logger } from "shared/logger.js";
import {
  ResponseStatus,
  GenerateElementImageRequest,
  GenerateImageResponse,
} from "core/types/api.js";

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
    const imageId = uuidv4();

    // Generate the image
    const imagePath = await aiImageGenerator.generateImageForTemplate(
      imageId,
      templateId,
      appearance,
      imageInstructions,
      undefined, // No references for now
      size,
      quality
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

export default router;
