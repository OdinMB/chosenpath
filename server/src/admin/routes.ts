import express from "express";
import { config } from "../config.js";
import { adminStoryService } from "./storyService.js";
import { Logger } from "../utils/logger.js";

// Simple authentication middleware
const authenticate = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    Logger.Admin.error(
      "Authentication failed: missing or invalid Authorization header"
    );
    return res.status(401).json({ error: "Authentication required" });
  }

  const token = authHeader.split(" ")[1];

  // Simple password check - should be replaced with a more secure method in production
  if (token !== config.adminPassword) {
    Logger.Admin.error("Authentication failed: invalid password");
    return res.status(403).json({ error: "Invalid credentials" });
  }

  Logger.Admin.log("Authentication successful");
  next();
};

const router = express.Router();

// Auth check route
router.get("/auth", authenticate, (req, res) => {
  Logger.Admin.log("Auth check successful");
  res.json({ authenticated: true });
});

// Get list of stories
router.get("/stories", authenticate, async (req, res) => {
  try {
    Logger.Admin.log("Fetching list of stories");
    const stories = await adminStoryService.getStoriesList();
    Logger.Admin.log(`Returning ${stories.length} stories`);
    res.json({ stories });
  } catch (error) {
    Logger.Admin.error("Failed to load stories", error);
    res.status(500).json({ error: "Failed to load stories" });
  }
});

// Get story details
router.get("/stories/:id", authenticate, async (req, res) => {
  try {
    const storyId = req.params.id;
    Logger.Admin.log(`Fetching story details: ${storyId}`);
    const storyState = await adminStoryService.getStory(storyId);
    Logger.Admin.log(`Successfully fetched story: ${storyId}`);
    res.json(storyState);
  } catch (error) {
    if ((error as Error).message === "Story not found") {
      Logger.Admin.error(`Story not found: ${req.params.id}`);
      return res.status(404).json({ error: "Story not found" });
    }
    Logger.Admin.error(`Failed to load story: ${req.params.id}`, error);
    res.status(500).json({ error: "Failed to load story" });
  }
});

// Delete story
router.delete("/stories/:id", authenticate, async (req, res) => {
  try {
    const storyId = req.params.id;
    Logger.Admin.log(`Deleting story: ${storyId}`);
    await adminStoryService.deleteStory(storyId);
    Logger.Admin.log(`Successfully deleted story: ${storyId}`);
    res.json({ success: true });
  } catch (error) {
    Logger.Admin.error(`Failed to delete story: ${req.params.id}`, error);
    res.status(500).json({ error: "Failed to delete story" });
  }
});

export const adminRouter = router;
