import express from "express";
import { config } from "../config/env.js";
import { adminStoryService } from "./storyService.js";

// Simple authentication middleware
const authenticate = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const token = authHeader.split(" ")[1];

  // Simple password check - should be replaced with a more secure method in production
  if (token !== config.adminPassword) {
    return res.status(403).json({ error: "Invalid credentials" });
  }

  next();
};

const router = express.Router();

// Auth check route
router.get("/auth", authenticate, (req, res) => {
  res.json({ authenticated: true });
});

// Get list of stories
router.get("/stories", authenticate, async (req, res) => {
  try {
    const stories = await adminStoryService.getStoriesList();
    res.json({ stories });
  } catch (error) {
    res.status(500).json({ error: "Failed to load stories" });
  }
});

// Get story details
router.get("/stories/:id", authenticate, async (req, res) => {
  try {
    const storyId = req.params.id;
    const storyState = await adminStoryService.getStory(storyId);
    res.json(storyState);
  } catch (error) {
    if ((error as Error).message === "Story not found") {
      return res.status(404).json({ error: "Story not found" });
    }
    res.status(500).json({ error: "Failed to load story" });
  }
});

// Delete story
router.delete("/stories/:id", authenticate, async (req, res) => {
  try {
    const storyId = req.params.id;
    await adminStoryService.deleteStory(storyId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete story" });
  }
});

export const adminRouter = router;
