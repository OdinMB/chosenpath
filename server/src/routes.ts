import express from "express";
import { Logger } from "shared/logger.js";
import { sendNotFound } from "shared/responseUtils.js";

import templateRoutes from "./templates/templateRoutes.js";
import storyRoutes from "./stories/storyRoutes.js";
import newsletterRoutes from "./newsletter/newsletterRoutes.js";
import userRoutes from "./users/userRoutes.js";

import adminUserRoutes from "./users/adminUserRoutes.js";
import adminStoryRoutes from "./stories/adminStoryRoutes.js";

import { imageRouter } from "./images/imageRoutes.js";
import imageGenerationRoutes from "./images/imageGenerationRoutes.js";
import feedbackRoutes from "./feedback/feedbackRoutes.js";

const router = express.Router();

// Mount routes in order of specificity (most specific first)

// Mount the image routes first to ensure they handle image requests before templateRoutes
// The full path for accessing images will be /images/templates/:templateId/:path(*)
router.use("/images", imageRouter);

// Use image generation routes
router.use(imageGenerationRoutes);

// Template and story routes come after image routes to avoid conflicts
router.use(templateRoutes);
router.use(storyRoutes);

// Newsletter routes
router.use(newsletterRoutes);

// User authentication routes
router.use(userRoutes);

// Feedback routes
router.use("/feedback", feedbackRoutes);

// Admin routes
router.use(adminUserRoutes);
router.use(adminStoryRoutes);

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
