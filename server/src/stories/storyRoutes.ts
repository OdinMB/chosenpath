import { Router, Request, Response } from "express";
import type * as Express from "express";
import { Logger } from "shared/logger.js";
import {
  sendSuccess,
  sendError,
  sendRateLimited,
} from "shared/responseUtils.js";
import { storyCreationService } from "./StoryCreationService.js";
import {
  addressKey,
  claimRateLimit,
  limitFailures,
  type RateLimitClaim,
} from "shared/rateLimiter.js";
import { storyStartLimit } from "shared/limitPolicy.js";
import { requestAddress } from "shared/clientAddress.js";
import { isOverCeiling } from "server/spend/spendLedger.js";
import {
  CodeExistsInfo,
  CreateStoryRequest,
  CreateStoryFromTemplateRequest,
  SPEND_CEILING_MESSAGE,
  UpdateStoryStatusRequest,
} from "core/types/api.js";
import { PlayerCount, isStoryCategory, kidAgesFrom } from "core/types/index.js";
import { DEFAULT_SELECTED_DIFFICULTY_MODIFIER } from "core/config.js";
import { verifyUser } from "../users/authMiddleware.js";
import { v4 as uuidv4 } from "uuid";
import { storyDbService } from "./StoryDbService.js";

const router = Router();

type StartAdmission = Extract<RateLimitClaim, { claimed: true }>;

/**
 * Lets a story start through, or answers its refusal: 429 once its start
 * limit is reached (limitPolicy.ts), 503 once today's spend ceiling for its
 * kind of story (signed in or not) is. The start is counted at once, before
 * the ceiling's database read, so parallel starts meet the same limit; a
 * refused start counts nothing. Returns the start's count, or null after a
 * refusal.
 */
async function admitStoryStart(
  req: Request,
  res: Response,
  generateImages: boolean,
  requestId: string
): Promise<StartAdmission | null> {
  const limit = storyStartLimit(req.user?.id, generateImages, requestAddress(req));
  const claim = claimRateLimit(limit.key, limit.action);
  if (!claim.claimed) {
    sendRateLimited(res, claim.rateLimit, requestId);
    return null;
  }
  if (await isOverCeiling(req.user ? "account" : "anonymous")) {
    claim.refund();
    sendError(res, SPEND_CEILING_MESSAGE, 503, requestId);
    return null;
  }
  return claim;
}

// Create a new story
router.post(
  "/stories",
  verifyUser({ required: false }),
  async (req: Request, res) => {
    try {
      const requestId = req.body?.requestId || "unknown";
      // As the creation reads it: any truthy value asks for images. The start
      // stays counted even when the content filter refuses it: that is an AI call
      const admitted = await admitStoryStart(
        req,
        res,
        Boolean((req.body as CreateStoryRequest)?.generateImages),
        requestId
      );
      if (!admitted) return;

      const {
        prompt,
        playerCount,
        maxTurns,
        generateImages,
        pregenerateBeats = false, // Default to false for now
        gameMode,
        difficultyLevel: requestedDifficultyLevel,
        category,
        kidAges,
      } = req.body as CreateStoryRequest;

      const creatorId = (req as Express.Request & { user?: { id: string } })
        .user?.id;

      // Let AI choose difficulty if the client did not make an explicit choice (i.e., still on default).
      const difficultyToPass =
        requestedDifficultyLevel &&
        requestedDifficultyLevel.modifier !==
          DEFAULT_SELECTED_DIFFICULTY_MODIFIER
          ? requestedDifficultyLevel
          : undefined;

      await storyCreationService.createStory(
        prompt,
        generateImages,
        pregenerateBeats,
        playerCount as PlayerCount,
        maxTurns,
        gameMode,
        difficultyToPass,
        res,
        creatorId,
        isStoryCategory(category) ? category : undefined,
        // The read-with-kids setting, only as whole ages from 2 to 14; anything else is left out
        kidAgesFrom(kidAges)
      );
    } catch (error) {
      // Also reached when the content filter is unavailable (it fails closed)
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

    let admitted: StartAdmission | null = null;
    try {
      admitted = await admitStoryStart(
        req,
        res,
        Boolean((req.body as CreateStoryFromTemplateRequest)?.generateImages),
        requestId
      );
      if (!admitted) return;

      const {
        templateId,
        playerCount: reqPlayerCount,
        maxTurns: reqMaxTurns,
        generateImages: reqGenerateImages,
        pregenerateBeats: reqPregenerateBeats = false, // Default to false for now
        difficultyLevel: reqDifficultyLevel,
      } = req.body as CreateStoryFromTemplateRequest;
      Logger.Route.log("Creating story from template");

      const creatorId = (req as Express.Request & { user?: { id: string } })
        .user?.id;

      const created = await storyCreationService.createStoryFromTemplate(
        templateId,
        reqPlayerCount as PlayerCount,
        reqMaxTurns,
        reqGenerateImages,
        reqPregenerateBeats,
        reqDifficultyLevel,
        res,
        creatorId
      );

      // A refused start (no such World, a player count it doesn't take, a
      // failed write) created nothing, so it doesn't count
      if (!created) admitted.refund();
    } catch (error) {
      admitted?.refund();
      Logger.Route.error("Failed to create story from template", error);
      sendError(res, "Failed to create story", 500, requestId, error);
    }
  }
);

// Whether a seat code names a story, for the home page's join form. Answers
// 200 either way and never which story; a miss counts as a failed code check
// against the address (verify_code), as a wrong code on the game page does.
router.get("/stories/:code/exists", async (req, res) => {
  const requestId = (req.query.requestId as string) || uuidv4();
  try {
    const outcome = await limitFailures(
      addressKey(requestAddress(req)),
      "verify_code",
      async () => {
        const exists =
          (await storyDbService.getStoryPlayerByCode(req.params.code)) !==
          undefined;
        return { succeeded: exists, value: exists };
      }
    );
    if (outcome.limited) {
      sendRateLimited(res, outcome.rateLimit, requestId);
      return;
    }
    sendSuccess<CodeExistsInfo>(res, { exists: outcome.value }, requestId);
  } catch (error) {
    sendError(res, "Failed to check the story code", 500, requestId, error);
  }
});

// Check story status
router.get("/stories/:id/status", async (req, res) => {
  const requestId = req.query.requestId as string;

  try {
    const storyId = req.params.id;
    Logger.Route.log(`Checking story status: ${storyId}`);
    // { status: "queued" | "ready" | "failed", reason? }
    const statusInfo = await storyCreationService.checkStoryStatus(storyId);
    sendSuccess(res, statusInfo, requestId);
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
      const userId = (req as Express.Request & { user?: { id: string } }).user
        ?.id;

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
