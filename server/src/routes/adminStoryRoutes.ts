import { Router } from "express";
import { Logger } from "shared/logger.js";
import { sendSuccess, sendError, sendNotFound } from "shared/responseUtils.js";
import { adminStoryService } from "admin/AdminStoryService.js";
import { DeleteStoryRequest } from "core/types/adminApi.js";
import { verifyAdmin } from "users/authMiddleware.js";
const router = Router();

// Get list of stories
router.get("/admin/stories", verifyAdmin, async (req, res) => {
  const requestId = req.query.requestId as string;

  try {
    Logger.Route.log("Fetching list of stories");
    const stories = await adminStoryService.getStoriesList();
    Logger.Route.log(`Returning ${stories.length} stories`);
    sendSuccess(res, { stories }, requestId);
  } catch (error) {
    Logger.Route.error("Failed to load stories", error);
    sendError(res, "Failed to load stories", 500, requestId, error);
  }
});

// Get story details
router.get("/admin/stories/:id", verifyAdmin, async (req, res) => {
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
router.delete("/admin/stories/:id", verifyAdmin, async (req, res) => {
  const requestId = req.body?.requestId || "unknown";

  try {
    const deleteRequest = req.body as DeleteStoryRequest;
    const storyId = deleteRequest.id;

    Logger.Route.log(`Deleting story: ${storyId}`);
    await adminStoryService.deleteStory(storyId);
    Logger.Route.log(`Successfully deleted story: ${storyId}`);
    sendSuccess(res, { success: true }, requestId);
  } catch (error) {
    if ((error as Error).message === "Story not found") {
      Logger.Route.error(`Story not found`);
      return sendNotFound(res, "Story not found", requestId);
    }
    Logger.Route.error(`Failed to delete story`, error);
    sendError(res, "Failed to delete story", 500, requestId, error);
  }
});

export default router;
