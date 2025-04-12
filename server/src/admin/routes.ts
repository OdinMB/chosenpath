import express from "express";
import { config } from "@/config.js";
import { adminStoryService } from "./AdminStoryService.js";
import { Logger } from "@common/logger.js";
import { AdminLibraryService } from "./AdminLibraryService.js";

// Simple authentication middleware
export const verifyAdmin = (
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
const libraryService = new AdminLibraryService();

// Auth check route
router.get("/auth", verifyAdmin, (req, res) => {
  Logger.Admin.log("Auth check successful");
  res.json({ authenticated: true });
});

// Get list of stories
router.get("/stories", verifyAdmin, async (req, res) => {
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
router.get("/stories/:id", verifyAdmin, async (req, res) => {
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
router.delete("/stories/:id", verifyAdmin, async (req, res) => {
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

// LIBRARY ROUTES

// Get all templates
router.get("/library/templates", verifyAdmin, async (req, res) => {
  try {
    const templates = await libraryService.getAllTemplates();
    Logger.Admin.log(`Retrieved ${templates.length} templates`);
    res.json({ templates });
  } catch (error) {
    Logger.Admin.error("Error retrieving templates", error);
    res.status(500).json({ error: "Failed to retrieve templates" });
  }
});

// Get template by ID
router.get("/library/templates/:id", verifyAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const template = await libraryService.getTemplateById(id);

    if (!template) {
      return res.status(404).json({ error: "Template not found" });
    }

    Logger.Admin.log(`Retrieved template ${id}`);
    res.json({ template });
  } catch (error) {
    Logger.Admin.error(`Error retrieving template ${id}`, error);
    res.status(500).json({ error: "Failed to retrieve template" });
  }
});

// Create a new template
router.post("/library/templates", verifyAdmin, async (req, res) => {
  const {
    playerCountMin,
    playerCountMax,
    gameMode,
    maxTurnsMin,
    maxTurnsMax,
    teaser,
    title,
    ...templateData
  } = req.body;

  if (!playerCountMin || !playerCountMax || !gameMode || !title) {
    return res.status(400).json({
      error:
        "Missing required fields: playerCountMin, playerCountMax, gameMode, title",
    });
  }

  try {
    // Prepare template data with the title field
    const fullTemplateData = {
      ...templateData,
      title,
      teaser: teaser || "",
    };

    const template = await libraryService.createTemplate(
      playerCountMin,
      playerCountMax,
      gameMode,
      fullTemplateData,
      templateData.tags || [],
      maxTurnsMin || 10,
      maxTurnsMax || 15
    );

    Logger.Admin.log(`Created template ${template.id}: ${title}`);
    res.status(201).json({ template });
  } catch (error) {
    Logger.Admin.error("Error creating template", error);
    res.status(500).json({ error: "Failed to create template" });
  }
});

// Update a template
router.put("/library/templates/:id", verifyAdmin, async (req, res) => {
  const { id } = req.params;
  const {
    playerCountMin,
    playerCountMax,
    gameMode,
    maxTurnsMin,
    maxTurnsMax,
    teaser,
    title,
    ...templateData
  } = req.body;

  if (!playerCountMin || !playerCountMax || !gameMode || !title) {
    return res.status(400).json({
      error:
        "Missing required fields: playerCountMin, playerCountMax, gameMode, title",
    });
  }

  try {
    // Prepare template data with the title field
    const fullTemplateData = {
      ...templateData,
      title,
      teaser: teaser || "",
    };

    const template = await libraryService.updateTemplate(
      id,
      playerCountMin,
      playerCountMax,
      gameMode,
      fullTemplateData,
      templateData.tags || [],
      maxTurnsMin,
      maxTurnsMax
    );

    Logger.Admin.log(`Updated template ${id}: ${title}`);
    res.json({ template });
  } catch (error) {
    // Check if it's a not found error
    if ((error as Error).message.includes("not found")) {
      return res.status(404).json({ error: "Template not found" });
    }

    Logger.Admin.error(`Error updating template ${id}`, error);
    res.status(500).json({ error: "Failed to update template" });
  }
});

// Delete a template
router.delete("/library/templates/:id", verifyAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await libraryService.deleteTemplate(id);

    if (!result) {
      return res.status(404).json({ error: "Template not found" });
    }

    Logger.Admin.log(`Deleted template ${id}`);
    res.json({ success: true });
  } catch (error) {
    // Check if it's a not found error
    if ((error as Error).message.includes("not found")) {
      return res.status(404).json({ error: "Template not found" });
    }

    Logger.Admin.error(`Error deleting template ${id}`, error);
    res.status(500).json({ error: "Failed to delete template" });
  }
});

// Generate a template using AI
router.post("/library/templates/generate", verifyAdmin, async (req, res) => {
  const { prompt, generateImages, playerCount, maxTurns, gameMode } = req.body;

  if (!prompt || !playerCount || !maxTurns || !gameMode) {
    return res.status(400).json({
      error: "Missing required fields: prompt, playerCount, maxTurns, gameMode",
    });
  }

  try {
    Logger.Admin.log(`Generating template with prompt: ${prompt}`);

    const template = await libraryService.generateTemplate(
      prompt,
      generateImages || false,
      playerCount,
      maxTurns,
      gameMode
    );

    Logger.Admin.log(`Generated template: ${template.title}`);
    res.status(201).json({ template });
  } catch (error) {
    Logger.Admin.error("Error generating template", error);
    res.status(500).json({ error: "Failed to generate template" });
  }
});

export const adminRouter = router;
