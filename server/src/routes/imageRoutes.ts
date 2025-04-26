import express from "express";
import path from "path";
import fs from "fs";
import { Logger } from "shared/logger.js";
import {
  getStoragePath,
  getStorageFilePath,
  storageFileExists,
} from "shared/storageUtils.js";
import { sendError, sendNotFound } from "shared/responseUtils.js";

const imageRouter = express.Router();

// Debug middleware to log all image requests
imageRouter.use((req, res, next) => {
  console.log(`[IMAGE-DEBUG] Request received: ${req.method} ${req.path}`);
  console.log(`[IMAGE-DEBUG] Full URL: ${req.originalUrl}`);
  console.log(`[IMAGE-DEBUG] Headers: ${JSON.stringify(req.headers, null, 2)}`);
  next();
});

// Serve template images
imageRouter.get("/templates/:templateId/:filename", async (req, res) => {
  const { templateId, filename } = req.params;
  const requestId = req.query.requestId as string;

  try {
    // Log more detailed information for debugging
    console.log(`[IMAGE-DEBUG] Serving image: ${templateId}/${filename}`);
    Logger.Route.log(`Serving image: ${templateId}/${filename}`);

    // Validate input to prevent directory traversal attacks
    if (templateId.includes("..") || filename.includes("..")) {
      Logger.Route.error(
        `Invalid path parameters detected: ${templateId}/${filename}`
      );
      return sendError(res, "Invalid request", 400, requestId);
    }

    // Construct subpath to the image
    const subPath = path.join(templateId, "images", filename);

    // Check if file exists
    if (!storageFileExists("library", subPath)) {
      // Add extra logging for debugging file path issues
      const imagePath = getStorageFilePath("library", subPath);
      console.log(`[IMAGE-DEBUG] Image not found at: ${imagePath}`);

      // Check the template directory exists
      const templatesBasePath = getStoragePath("library");
      const templateDirPath = path.join(templatesBasePath, templateId);
      console.log(`[IMAGE-DEBUG] Template directory: ${templateDirPath}`);
      console.log(
        `[IMAGE-DEBUG] Template directory exists: ${fs.existsSync(
          templateDirPath
        )}`
      );

      if (fs.existsSync(templateDirPath)) {
        // List files in template directory for debugging
        console.log(
          `[IMAGE-DEBUG] Files in template directory:`,
          fs.readdirSync(templateDirPath)
        );
      }

      Logger.Route.error(`Image not found: ${templateId}/${filename}`);
      return sendNotFound(res, "Image not found", requestId);
    }

    // Check file extension for basic security
    const ext = path.extname(filename).toLowerCase();
    const allowedExts = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"];

    if (!allowedExts.includes(ext)) {
      Logger.Route.error(`Invalid file extension: ${ext}`);
      return sendError(res, "Invalid file type", 400, requestId);
    }

    // Set appropriate content type
    const contentTypes: Record<string, string> = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".gif": "image/gif",
      ".webp": "image/webp",
      ".svg": "image/svg+xml",
    };

    res.setHeader("Content-Type", contentTypes[ext]);

    // Set cache control headers (cache for 1 day)
    res.setHeader("Cache-Control", "public, max-age=86400");

    // Get the full file path and send the file
    const imagePath = getStorageFilePath("library", subPath);
    console.log(`[IMAGE-DEBUG] Sending file: ${imagePath}`);
    res.sendFile(imagePath, (err) => {
      if (err) {
        console.log(`[IMAGE-DEBUG] Error sending file: ${err.message}`);
        sendError(res, "Failed to serve image", 500, requestId, err);
      } else {
        console.log(`[IMAGE-DEBUG] File sent successfully: ${imagePath}`);
      }
    });
  } catch (error) {
    console.log(`[IMAGE-DEBUG] Error in image route: ${error}`);
    Logger.Route.error(
      `Error serving template image: ${templateId}/${filename}`,
      error
    );
    sendError(res, "Failed to serve image", 500, requestId, error);
  }
});

// Catch-all for invalid image routes
imageRouter.use((req, res) => {
  const requestId = (req.query.requestId as string) || "unknown";
  console.log(
    `[IMAGE-DEBUG] Invalid route handler triggered: ${req.originalUrl}`
  );
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
  console.log("[IMAGE-DEBUG] Test route accessed");
  res.send("Image server is working correctly!");
});

export { imageRouter };
