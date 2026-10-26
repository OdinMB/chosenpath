import type { Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { ImageGenerationError } from "server/images/AIImageGenerator.js";
import { Logger } from "shared/logger.js";
import { sendError } from "shared/responseUtils.js";
import {
  ResponseStatus,
  ImageGenerationErrorResponse,
} from "core/types/index.js";

/**
 * Answers a failed template-editor image request. An ImageGenerationError
 * keeps its structured info, which the editor shows. Anything else is a 500
 * with a plain sentence; its detail goes to the server log only.
 */
export const sendImageGenerationError = (
  res: Response,
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
      // The raw provider error stays in the server log below
      imageGenerationError: {
        ...error.imageGenerationError,
        technicalMessage: "",
      },
    };

    Logger.Story.log(
      `Image generation error [${response.requestId}] (${statusCode}) - ${error.imageGenerationError.errorCode}: ${error.imageGenerationError.technicalMessage}`
    );

    res.status(statusCode).json(response);
  } else {
    sendError(res, "Failed to generate image", 500, requestId, error);
  }
};
