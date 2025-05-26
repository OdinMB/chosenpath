import { Router } from "express";
import { Logger } from "shared/logger.js";
import { sendSuccess, sendError, sendNotFound } from "shared/responseUtils.js";
import { adminStoryService } from "server/stories/AdminStoryService.js";
import { DeleteStoryRequest } from "core/types/index.js";
import {
  GetAdminStoriesResponse,
  GetAdminStoriesResponseData,
} from "core/types/api.js";
import { verifyAdmin } from "users/authMiddleware.js";
import { v4 as uuidv4 } from "uuid";
const router = Router();

// Get list of stories
router.get("/admin/stories", verifyAdmin(), async (req, res) => {
  const requestId = (req.query.requestId as string) || uuidv4();
  Logger.Route.log(`[${requestId}] Starting GET /admin/stories request`);

  try {
    Logger.Route.log(`[${requestId}] Fetching list of stories`);
    const stories = await adminStoryService.getStoriesList();
    Logger.Route.log(
      `[${requestId}] Successfully fetched ${stories.length} stories`
    );

    Logger.Route.log(`[${requestId}] Sending response`);
    const responseData: GetAdminStoriesResponseData = { stories };
    sendSuccess<GetAdminStoriesResponseData>(res, responseData, requestId);
    Logger.Route.log(`[${requestId}] Response sent successfully`);
  } catch (error) {
    Logger.Route.error(`[${requestId}] Failed to load stories`, error);
    sendError(res, "Failed to load stories", 500, requestId, error);
  }
});

// Get story details
router.get("/admin/stories/:id", verifyAdmin(), async (req, res) => {
  const requestId = req.query.requestId as string;

  try {
    const storyId = req.params.id;
    Logger.Route.log(`Fetching story details: ${storyId}`);
    const storyState = await adminStoryService.getStory(storyId);
    Logger.Route.log(`Successfully fetched story: ${storyId}`);
    sendSuccess(res, { story: storyState }, requestId);
  } catch (error) {
    if ((error as Error).message === "Story not found") {
      Logger.Route.error(`Story not found: ${req.params.id}`);
      return sendNotFound(res, "Story not found", requestId);
    }
    Logger.Route.error(`Failed to load story: ${req.params.id}`, error);
    sendError(res, "Failed to load story", 500, requestId, error);
  }
});

// Delete story
router.delete("/admin/stories/:id", verifyAdmin(), async (req, res) => {
  const requestId = (req.query.requestId as string) || uuidv4();
  const storyId = req.params.id;

  // Validate the request matches DeleteStoryRequest type
  const deleteRequest: DeleteStoryRequest = {
    id: storyId,
    requestId,
  };

  try {
    Logger.Route.log(`[${requestId}] Deleting story: ${storyId}`);
    await adminStoryService.deleteStory(storyId);
    Logger.Route.log(`[${requestId}] Successfully deleted story: ${storyId}`);
    sendSuccess(res, { success: true }, requestId);
  } catch (error) {
    if ((error as Error).message === "Story not found") {
      Logger.Route.error(`[${requestId}] Story not found: ${storyId}`);
      return sendNotFound(res, "Story not found", requestId);
    }
    Logger.Route.error(
      `[${requestId}] Failed to delete story: ${storyId}`,
      error
    );
    sendError(res, "Failed to delete story", 500, requestId, error);
  }
});

export default router;
