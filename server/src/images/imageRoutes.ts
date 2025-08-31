import express from "express";
import path from "path";
import { Logger } from "shared/logger.js";
import {
  getStorageFilePath,
  storageFileExists,
  getStoryImagesDirectoryPath,
} from "shared/storageUtils.js";
import { sendError, sendNotFound, sendSuccess } from "shared/responseUtils.js";
import fsSync from "fs";
import type { RenameTemplateImageRequest } from "core/types/api.js";

/**
 * Validates that path parameters don't contain directory traversal sequences
 * @param paths Array of path strings to validate
 * @returns true if all paths are safe, false otherwise
 */
function validateSafePaths(...paths: string[]): boolean {
  // Only check for dangerous patterns, not regular path separators
  // The filePath parameter is expected to contain forward slashes for subdirectories
  return paths.every(pathParam => {
    if (!pathParam || typeof pathParam !== 'string') return false;
    
    // Check for directory traversal attempts
    if (pathParam.includes('..')) return false;
    
    // Check for backslashes (Windows path separators that shouldn't be in URLs)
    if (pathParam.includes('\\')) return false;
    
    // Check for absolute paths (starting with /)
    if (pathParam.startsWith('/')) return false;
    
    return true;
  });
}

const imageRouter = express.Router();

// Debug middleware to log all image requests
// imageRouter.use((req, res, next) => {
// console.log(`[IMAGE-DEBUG] Request received: ${req.method} ${req.path}`);
// Logger.Route.log(`[IMAGE-DEBUG] Full URL: ${req.originalUrl}`);
// console.log(`[IMAGE-DEBUG] Headers: ${JSON.stringify(req.headers, null, 2)}`);
// next();
// });

/**
 * Helper function to serve an image file
 * @param res - Express response object
 * @param imagePath - Full path to the image file
 * @param requestId - Request ID for logging
 * @param maxAge - Cache max age in milliseconds
 */
const serveImageFile = (
  res: express.Response,
  imagePath: string,
  requestId: string,
  maxAge: number
) => {
  // Get the filename from the path
  const filename = path.basename(imagePath);

  // Check file extension for basic security
  const ext = path.extname(filename).toLowerCase();
  const allowedExts = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"];

  if (!allowedExts.includes(ext)) {
    Logger.Route.error(`Invalid file extension: ${ext}`);
    return sendError(res, "Invalid file type", 400, requestId);
  }

  // Use sendFile options to set appropriate headers
  const options = {
    maxAge: maxAge,
    headers: {
      "Cache-Control": `public, max-age=${maxAge / 1000}`,
    },
  };

  // Send the file with options
  res.sendFile(imagePath, options, (err) => {
    if (err) {
      Logger.Route.error(
        `[IMAGE-DEBUG] Error sending image file: ${err.message}`
      );
      // Check if headers were already sent before attempting to send an error response
      if (!res.headersSent) {
        sendError(res, "Failed to serve image", 500, requestId, err);
      }
    }
    // else {
    //   Logger.Route.log(
    //     `[IMAGE-DEBUG] Image file sent successfully: ${imagePath}`
    //   );
    // }
  });
};

// Use a more flexible route pattern with an optional path parameter
// Changed to /templates/:templateId/:path(*) to work with /images prefix
imageRouter.get("/templates/:templateId/:path(*)", async (req, res) => {
  const { templateId, path: filePath } = req.params;
  const requestId = req.query.requestId as string;

  try {
    // Validate input to prevent directory traversal attacks
    if (!validateSafePaths(templateId, filePath)) {
      Logger.Route.error(
        `Invalid path parameters detected: ${templateId}/${filePath}`
      );
      return sendError(res, "Invalid request", 400, requestId);
    }

    // For cover.jpeg in the root, we need to look in the images subdirectory
    const subPath = path.join(templateId, "images", filePath);

    // Check if file exists
    const fileExists = storageFileExists("templates", subPath);
    const imagePath = getStorageFilePath("templates", subPath);

    if (!fileExists) {
      // Logger.Route.error(`Template image not found: ${templateId}/${filePath}`);
      return sendNotFound(res, "Image not found", requestId);
    }

    // Determine appropriate max-age based on query params
    const timeParam = req.query.t;
    const maxAge = timeParam ? 60 * 1000 : 86400 * 1000; // 1 minute or 1 day in ms

    // Serve the image file
    serveImageFile(res, imagePath, requestId, maxAge);
  } catch (error) {
    Logger.Route.error(
      `Error serving template image: ${templateId}/${filePath}`,
      error
    );
    sendError(res, "Failed to serve image", 500, requestId, error);
  }
});

// Route for story images with /images prefix
imageRouter.get("/stories/:storyId/:path(*)", async (req, res) => {
  const { storyId, path: filePath } = req.params;
  const requestId = req.query.requestId as string;

  try {
    // Validate input to prevent directory traversal attacks
    if (!validateSafePaths(storyId, filePath)) {
      Logger.Route.error(
        `Invalid path parameters detected: ${storyId}/${filePath}`
      );
      return sendError(res, "Invalid request", 400, requestId);
    }

    // Get the images directory path for this story
    const storyImagesDir = getStoryImagesDirectoryPath(storyId);
    const imagePath = path.join(storyImagesDir, filePath);

    // Check if file exists
    if (!fsSync.existsSync(imagePath)) {
      Logger.Route.error(`Story image not found: ${imagePath}`);
      return sendNotFound(res, "Image not found", requestId);
    }

    // Determine appropriate max-age based on query params
    const timeParam = req.query.t;
    const maxAge = timeParam ? 60 * 1000 : 86400 * 1000; // 1 minute or 1 day in ms

    // Serve the image file
    serveImageFile(res, imagePath, requestId, maxAge);
  } catch (error) {
    Logger.Route.error(
      `Error serving story image: ${storyId}/${filePath}`,
      error
    );
    sendError(res, "Failed to serve image", 500, requestId, error);
  }
});

// Template image management endpoints

/**
 * Rename template images when story element IDs change
 * POST /api/images/templates/:templateId/rename
 */
imageRouter.post("/templates/:templateId/rename", async (req, res) => {
  const { templateId } = req.params;
  const { oldElementId, newElementId } = req.body as RenameTemplateImageRequest;
  const requestId = req.body.requestId || "unknown";

  try {
    // Validate input and prevent path traversal
    if (
      !oldElementId ||
      !newElementId ||
      !validateSafePaths(templateId, oldElementId, newElementId)
    ) {
      return sendError(res, "Invalid parameters", 400, requestId);
    }

    // Get image file paths
    const oldImagePath = getStorageFilePath(
      "templates",
      path.join(templateId, "images", `${oldElementId}.jpeg`)
    );
    const newImagePath = getStorageFilePath(
      "templates",
      path.join(templateId, "images", `${newElementId}.jpeg`)
    );

    // Check if old image exists
    if (!fsSync.existsSync(oldImagePath)) {
      // No image to rename, this is fine
      return sendSuccess(
        res,
        { success: true, message: "No image found to rename" },
        requestId
      );
    }

    // Rename the image file
    fsSync.renameSync(oldImagePath, newImagePath);

    Logger.Route.log(
      `Renamed template image: ${oldElementId} -> ${newElementId} for template ${templateId}`
    );

    return sendSuccess(
      res,
      { success: true, message: "Image renamed successfully" },
      requestId
    );
  } catch (error) {
    Logger.Route.error(
      `Error renaming template image: ${templateId}/${oldElementId} -> ${newElementId}`,
      error
    );
    return sendError(res, "Failed to rename image", 500, requestId, error);
  }
});

/**
 * Delete template images when story elements are deleted
 * DELETE /api/images/templates/:templateId/element/:elementId
 */
imageRouter.delete(
  "/templates/:templateId/element/:elementId",
  async (req, res) => {
    const { templateId, elementId } = req.params;
    const requestId = (req.query.requestId as string) || "unknown";

    try {
      // Validate input and prevent path traversal
      if (!elementId || !validateSafePaths(templateId, elementId)) {
        return sendError(res, "Invalid parameters", 400, requestId);
      }

      // Get image file path
      const imagePath = getStorageFilePath(
        "templates",
        path.join(templateId, "images", `${elementId}.jpg`)
      );

      // Check if image exists and delete it
      if (fsSync.existsSync(imagePath)) {
        fsSync.unlinkSync(imagePath);
        Logger.Route.log(
          `Deleted template image: ${elementId} for template ${templateId}`
        );
        return sendSuccess(
          res,
          { success: true, message: "Image deleted successfully" },
          requestId
        );
      } else {
        // No image to delete, this is fine
        return sendSuccess(
          res,
          { success: true, message: "No image found to delete" },
          requestId
        );
      }
    } catch (error) {
      Logger.Route.error(
        `Error deleting template image: ${templateId}/${elementId}`,
        error
      );
      return sendError(res, "Failed to delete image", 500, requestId, error);
    }
  }
);

// Add a test route to verify proxy
imageRouter.get("/test", (req, res) => {
  Logger.Route.log("[IMAGE-DEBUG] Test route accessed");
  res.send("Image server is working correctly!");
});

// Catch-all for invalid image routes (must be last!)
imageRouter.use((req, res) => {
  const requestId = (req.query.requestId as string) || "unknown";
  Logger.Route.error(`Invalid image request: ${req.method} ${req.originalUrl}`);

  // For image requests, return a valid image response with a generic "not found" image
  if (req.accepts("image/*")) {
    // If you want to serve a placeholder image
    res.status(404).send("Image not found");
  } else {
    // For non-image requests, return a JSON error
    sendNotFound(res, "Image not found", requestId);
  }
});

export { imageRouter };
