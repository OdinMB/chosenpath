import express from "express";
import path from "path";
import { Logger } from "shared/logger.js";
import {
  getStorageFilePath,
  storageFileExists,
  getStoryVideosDirectoryPath,
} from "shared/storageUtils.js";
import { sendError, sendNotFound } from "shared/responseUtils.js";
import { verifyUser, canGenerateVideos } from "../users/authMiddleware.js";
import { VIDEO_GENERATION_UNAVAILABLE_MESSAGE } from "./AIVideoGenerator.js";
import fsSync from "fs";

/**
 * Validates that path parameters don't contain directory traversal sequences
 */
function validateSafePaths(...paths: string[]): boolean {
  return paths.every((pathParam) => {
    if (!pathParam || typeof pathParam !== "string") return false;
    if (pathParam.includes("..")) return false;
    if (pathParam.includes("\\")) return false;
    if (pathParam.startsWith("/")) return false;
    return true;
  });
}

const videoRouter = express.Router();

/**
 * Helper function to serve a video file
 */
const serveVideoFile = (
  res: express.Response,
  videoPath: string,
  requestId: string,
  maxAge: number
) => {
  const filename = path.basename(videoPath);
  const ext = path.extname(filename).toLowerCase();
  const allowedExts = [".mp4", ".webm", ".mov"];

  if (!allowedExts.includes(ext)) {
    Logger.Route.error(`Invalid file extension: ${ext}`);
    return sendError(res, "Invalid file type", 400, requestId);
  }

  const options = {
    maxAge: maxAge,
    headers: {
      "Cache-Control": `public, max-age=${maxAge / 1000}`,
      "Content-Type": "video/mp4",
    },
  };

  res.sendFile(videoPath, options, (err) => {
    if (err) {
      Logger.Route.error(`Error sending video file: ${err.message}`);
      if (!res.headersSent) {
        sendError(res, "Failed to serve video", 500, requestId, err);
      }
    }
  });
};

// Serve template videos
videoRouter.get("/templates/:templateId/:path(*)", async (req, res) => {
  const { templateId, path: filePath } = req.params;
  const requestId = req.query.requestId as string;

  try {
    if (!validateSafePaths(templateId, filePath)) {
      Logger.Route.error(
        `Invalid path parameters detected: ${templateId}/${filePath}`
      );
      return sendError(res, "Invalid request", 400, requestId);
    }

    const subPath = path.join(templateId, "videos", filePath);
    const fileExists = storageFileExists("templates", subPath);
    const videoPath = getStorageFilePath("templates", subPath);

    if (!fileExists) {
      return sendNotFound(res, "Video not found", requestId);
    }

    const timeParam = req.query.t;
    const maxAge = timeParam ? 60 * 1000 : 86400 * 1000; // 1 minute or 1 day

    serveVideoFile(res, videoPath, requestId, maxAge);
  } catch (error) {
    Logger.Route.error(
      `Error serving template video: ${templateId}/${filePath}`,
      error
    );
    sendError(res, "Failed to serve video", 500, requestId, error);
  }
});

// Serve story videos
videoRouter.get("/stories/:storyId/:path(*)", async (req, res) => {
  const { storyId, path: filePath } = req.params;
  const requestId = req.query.requestId as string;

  try {
    if (!validateSafePaths(storyId, filePath)) {
      Logger.Route.error(
        `Invalid path parameters detected: ${storyId}/${filePath}`
      );
      return sendError(res, "Invalid request", 400, requestId);
    }

    const storyVideosDir = getStoryVideosDirectoryPath(storyId);
    const videoPath = path.join(storyVideosDir, filePath);

    if (!fsSync.existsSync(videoPath)) {
      Logger.Route.error(`Story video not found: ${videoPath}`);
      return sendNotFound(res, "Video not found", requestId);
    }

    const timeParam = req.query.t;
    const maxAge = timeParam ? 60 * 1000 : 86400 * 1000;

    serveVideoFile(res, videoPath, requestId, maxAge);
  } catch (error) {
    Logger.Route.error(
      `Error serving story video: ${storyId}/${filePath}`,
      error
    );
    sendError(res, "Failed to serve video", 500, requestId, error);
  }
});

// Generate video endpoint (requires authentication and permission).
// No video generator is implemented (Sora was retired on 2026-09-24; see
// AIVideoGenerator.ts), so this answers 501 and reads nothing but the requestId.
videoRouter.post("/generate", verifyUser(), canGenerateVideos(), (req, res) => {
  sendError(res, VIDEO_GENERATION_UNAVAILABLE_MESSAGE, 501, req.body?.requestId);
});

// Test route
videoRouter.get("/test", (req, res) => {
  Logger.Route.log("Video server test route accessed");
  res.send("Video server is working correctly!");
});

// Catch-all for invalid video routes
videoRouter.use((req, res) => {
  const requestId = (req.query.requestId as string) || "unknown";
  Logger.Route.error(`Invalid video request: ${req.method} ${req.originalUrl}`);

  if (req.accepts("video/*")) {
    res.status(404).send("Video not found");
  } else {
    sendNotFound(res, "Video not found", requestId);
  }
});

export { videoRouter };
