import { Router, Request } from "express";
import { Logger } from "shared/logger.js";
import {
  sendSuccess,
  sendError,
  sendRateLimited,
} from "shared/responseUtils.js";
import { storyCreationService } from "shared/StoryCreationService.js";
import { checkRateLimit, incrementRateLimit } from "shared/rateLimiter.js";
import {
  CreateStoryRequest,
  CreateStoryFromTemplateRequest,
} from "core/types/api.js";
import { PlayerCount } from "core/types/index.js";

const router = Router();

// Create a new story
router.post("/stories", async (req: Request, res) => {
  try {
    const requestId = req.body?.requestId || "unknown";
    // Check rate limit
    const rateLimit = checkRateLimit(req, "initialize_story");
    if (rateLimit.isLimited) {
      sendRateLimited(res, rateLimit, requestId);
      return;
    }

    // Increment rate limit after successful creation
    incrementRateLimit(req, "initialize_story");

    const { prompt, playerCount, maxTurns, generateImages, gameMode } =
      req.body as CreateStoryRequest;

    await storyCreationService.createStory(
      prompt,
      generateImages,
      playerCount as PlayerCount,
      maxTurns,
      gameMode,
      res
    );
  } catch (error) {
    Logger.Route.error("Failed to create story:", error);
    res.status(500).json({
      error: "Failed to create story",
      type: "ServerError",
    });
  }
});

// Create a story from template
router.post("/stories/template", async (req, res) => {
  const requestId = req.body?.requestId || "unknown";

  try {
    // Check rate limit
    const rateLimit = checkRateLimit(req, "initialize_story");
    if (rateLimit.isLimited) {
      sendRateLimited(res, rateLimit, requestId);
      return;
    }

    const createRequest = req.body as CreateStoryFromTemplateRequest;
    Logger.Route.log("Creating story from template");

    await storyCreationService.createStoryFromTemplate(
      createRequest.templateId,
      createRequest.playerCount as PlayerCount,
      createRequest.maxTurns,
      createRequest.generateImages,
      res
    );

    // Increment rate limit after successful creation
    incrementRateLimit(req, "initialize_story");
  } catch (error) {
    Logger.Route.error("Failed to create story from template", error);
    sendError(res, "Failed to create story", 500, requestId, error);
  }
});

// Check story status
router.get("/stories/:id/status", async (req, res) => {
  const requestId = req.query.requestId as string;

  try {
    const storyId = req.params.id;
    Logger.Route.log(`Checking story status: ${storyId}`);
    const status = await storyCreationService.checkStoryStatus(storyId);
    sendSuccess(res, { status }, requestId);
  } catch (error) {
    Logger.Route.error(`Failed to check story status: ${req.params.id}`, error);
    sendError(res, "Failed to check story status", 500, requestId, error);
  }
});

export default router;
