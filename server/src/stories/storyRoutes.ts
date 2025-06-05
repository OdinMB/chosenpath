import { Router, Request } from "express";
import { Logger } from "shared/logger.js";
import {
  sendSuccess,
  sendError,
  sendRateLimited,
} from "shared/responseUtils.js";
import { storyCreationService } from "./StoryCreationService.js";
import {
  checkRateLimitForRequest,
  incrementRateLimitForRequest,
} from "shared/rateLimiter.js";
import {
  CreateStoryRequest,
  CreateStoryFromTemplateRequest,
  UpdateStoryStatusRequest,
} from "core/types/api.js";
import { PlayerCount } from "core/types/index.js";
import { verifyUser } from "../users/authMiddleware.js";
import { v4 as uuidv4 } from "uuid";
import { storyDbService } from "./StoryDbService.js";

const router = Router();

// Create a new story
router.post(
  "/stories",
  verifyUser({ required: false }),
  async (req: Request, res) => {
    try {
      const requestId = req.body?.requestId || "unknown";
      // Check rate limit
      const rateLimit = checkRateLimitForRequest(req, "initialize_story");
      if (rateLimit.isLimited) {
        sendRateLimited(res, rateLimit, requestId);
        return;
      }

      // Increment rate limit after successful creation
      incrementRateLimitForRequest(req, "initialize_story");

      const {
        prompt,
        playerCount,
        maxTurns,
        generateImages,
        gameMode,
        difficultyLevel,
      } = req.body as CreateStoryRequest;

      const creatorId = (req as any).user?.id;

      await storyCreationService.createStory(
        prompt,
        generateImages,
        playerCount as PlayerCount,
        maxTurns,
        gameMode,
        difficultyLevel,
        res,
        creatorId
      );
    } catch (error) {
      Logger.Route.error("Failed to create story:", error);
      // Get requestId from the body if available, or generate a new one if critical for sendError
      const requestId = (req.body as CreateStoryRequest)?.requestId || uuidv4();
      sendError(
        res,
        "Failed to create story due to an internal server issue.",
        500,
        requestId,
        error
      );
    }
  }
);

// Create a story from template
router.post(
  "/stories/template",
  verifyUser({ required: false }),
  async (req, res) => {
    const requestId = req.body?.requestId || "unknown";

    try {
      // Check rate limit
      const rateLimit = checkRateLimitForRequest(req, "initialize_story");
      if (rateLimit.isLimited) {
        sendRateLimited(res, rateLimit, requestId);
        return;
      }

      const {
        templateId,
        playerCount: reqPlayerCount,
        maxTurns: reqMaxTurns,
        generateImages: reqGenerateImages,
        difficultyLevel: reqDifficultyLevel,
      } = req.body as CreateStoryFromTemplateRequest;
      Logger.Route.log("Creating story from template");

      const creatorId = (req as any).user?.id;

      await storyCreationService.createStoryFromTemplate(
        templateId,
        reqPlayerCount as PlayerCount,
        reqMaxTurns,
        reqGenerateImages,
        reqDifficultyLevel,
        res,
        creatorId
      );

      // Increment rate limit after successful creation
      incrementRateLimitForRequest(req, "initialize_story");
    } catch (error) {
      Logger.Route.error("Failed to create story from template", error);
      sendError(res, "Failed to create story", 500, requestId, error);
    }
  }
);

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

// Update story status (archive or delete)
router.put(
  "/stories/status",
  verifyUser({ required: true }),
  async (req, res) => {
    const requestId = req.body?.requestId || "unknown";

    try {
      const { storyId, playerSlot, status } =
        req.body as UpdateStoryStatusRequest;
      const userId = (req as any).user?.id;

      if (!userId) {
        sendError(res, "Authentication required", 401, requestId);
        return;
      }

      // Verify that the user has permission to update this story's status
      const hasPermission = await storyDbService.verifyUserCanUpdateStoryStatus(
        userId,
        storyId,
        playerSlot
      );

      if (!hasPermission) {
        sendError(res, "Unauthorized to update this story", 403, requestId);
        return;
      }

      await storyDbService.updatePlayerStatus(storyId, playerSlot, status);

      Logger.Route.log(
        `Updated story ${storyId} player ${playerSlot} status to ${status}`
      );
      sendSuccess(res, { success: true }, requestId);
    } catch (error) {
      Logger.Route.error(
        `Failed to update story status: ${req.body.storyId}`,
        error
      );
      sendError(res, "Failed to update story status", 500, requestId, error);
    }
  }
);

export default router;
