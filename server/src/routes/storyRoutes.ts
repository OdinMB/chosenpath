import express from "express";
import { Logger } from "shared/logger.js";
import { sendSuccess, sendError, sendNotFound } from "shared/responseUtils.js";
import { adminStoryService } from "admin/AdminStoryService.js";
import { DeleteStoryRequest } from "core/types/index.js";
import { verifyAdmin } from "./auth.js";
import { storyCreationService } from "shared/StoryCreationService.js";
import {
  CreateStoryRequest,
  CreateStoryFromTemplateRequest,
} from "core/types/api.js";
import { PlayerCount } from "core/types/index.js";

const router = express.Router();

// Auth check route
router.get("/admin/auth", verifyAdmin, (req, res) => {
  Logger.Route.log("Auth check successful");
  sendSuccess(res, { authenticated: true }, req.query.requestId as string);
});

// Create a new story
router.post("/stories", async (req, res) => {
  const requestId = req.body?.requestId || "unknown";

  try {
    const createRequest = req.body as CreateStoryRequest;
    Logger.Route.log("Creating new story");

    const { storyId, codes } = await storyCreationService.createStory(
      createRequest.prompt,
      createRequest.generateImages,
      createRequest.playerCount as PlayerCount,
      createRequest.maxTurns,
      createRequest.gameMode
    );

    sendSuccess(res, { storyId, codes, status: "queued" }, requestId);
  } catch (error) {
    Logger.Route.error("Failed to create story", error);
    sendError(res, "Failed to create story", 500, requestId, error);
  }
});

// Create a story from template
router.post("/stories/template", async (req, res) => {
  const requestId = req.body?.requestId || "unknown";

  try {
    const createRequest = req.body as CreateStoryFromTemplateRequest;
    Logger.Route.log("Creating story from template");

    const { storyId, codes } =
      await storyCreationService.createStoryFromTemplate(
        createRequest.templateId,
        createRequest.playerCount as PlayerCount,
        createRequest.maxTurns,
        createRequest.generateImages
      );

    sendSuccess(res, { storyId, codes, status: "queued" }, requestId);
  } catch (error) {
    Logger.Route.error("Failed to create story from template", error);
    sendError(
      res,
      "Failed to create story from template",
      500,
      requestId,
      error
    );
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
    const storyId = req.params.id;

    Logger.Route.log(`Deleting story: ${storyId}`);
    await adminStoryService.deleteStory(storyId);
    Logger.Route.log(`Successfully deleted story: ${storyId}`);
    sendSuccess(res, { success: true }, requestId);
  } catch (error) {
    if ((error as Error).message === "Story not found") {
      Logger.Route.error(`Story not found: ${req.params.id}`);
      return sendNotFound(res, "Story not found", requestId);
    }
    Logger.Route.error(`Failed to delete story: ${req.params.id}`, error);
    sendError(res, "Failed to delete story", 500, requestId, error);
  }
});

export default router;
