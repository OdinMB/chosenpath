import express from "express";
import path from "path";
import { Logger } from "shared/logger.js";
import {
  getStorageFilePath,
  storageFileExists,
  getStoryImagesDirectoryPath,
} from "shared/storageUtils.js";
import { sendError, sendNotFound } from "shared/responseUtils.js";
import fsSync from "fs";

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
    if (templateId.includes("..") || filePath.includes("..")) {
      Logger.Route.error(
        `Invalid path parameters detected: ${templateId}/${filePath}`
      );
      return sendError(res, "Invalid request", 400, requestId);
    }

    // For cover.jpeg in the root, we need to look in the images subdirectory
    let subPath = path.join(templateId, "images", filePath);

    // Check if file exists
    let fileExists = storageFileExists("templates", subPath);
    let imagePath = getStorageFilePath("templates", subPath);

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
    if (storyId.includes("..") || filePath.includes("..")) {
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

// Catch-all for invalid image routes
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

// Add a test route to verify proxy
imageRouter.get("/test", (req, res) => {
  Logger.Route.log("[IMAGE-DEBUG] Test route accessed");
  res.send("Image server is working correctly!");
});

export { imageRouter };
