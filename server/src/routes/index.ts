import express from "express";
import templateRoutes from "./templateRoutes.js";
import storyRoutes from "./storyRoutes.js";
import { imageRouter } from "./imageRoutes.js";
import imageGenerationRoutes from "./imageGenerationRoutes.js";
import { Logger } from "shared/logger.js";
import { sendNotFound } from "shared/responseUtils.js";

const router = express.Router();

// Mount the image routes for direct API access
router.use("/images", imageRouter);

// Use image generation routes - Register before template routes to avoid conflicts
router.use(imageGenerationRoutes);

// Use template routes
router.use(templateRoutes);

// Use story routes
router.use(storyRoutes);

// Catch-all 404 handler
router.use((req, res) => {
  const requestId =
    (req.query.requestId as string) ||
    (req.body && req.body.requestId) ||
    "unknown";

  Logger.Route.error(`404 Not Found: ${req.method} ${req.originalUrl}`);
  sendNotFound(res, "Route not found", requestId);
});

export { router };
