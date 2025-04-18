import express from "express";
import { config } from "@/config.js";
import { Logger } from "@common/logger.js";
import { PublicationStatus } from "@core/types/index.js";
import { adminStoryService } from "./admin/AdminStoryService.js";
import { AdminLibraryService } from "./admin/AdminLibraryService.js";

// Simple authentication middleware
export const verifyAdmin = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    Logger.Route.error(
      "Authentication failed: missing or invalid Authorization header"
    );
    return res.status(401).json({ error: "Authentication required" });
  }

  const token = authHeader.split(" ")[1];

  // Simple password check - should be replaced with a more secure method in production
  if (token !== config.adminPassword) {
    Logger.Route.error("Authentication failed: invalid password");
    return res.status(403).json({ error: "Invalid credentials" });
  }

  Logger.Route.log("Authentication successful");
  next();
};

const router = express.Router();
const libraryService = new AdminLibraryService();

// Auth check route
router.get("/admin/auth", verifyAdmin, (req, res) => {
  Logger.Route.log("Auth check successful");
  res.json({ authenticated: true });
});

// STORY MANAGEMENT

// Get list of stories
router.get("/admin/stories", verifyAdmin, async (req, res) => {
  try {
    Logger.Route.log("Fetching list of stories");
    const stories = await adminStoryService.getStoriesList();
    Logger.Route.log(`Returning ${stories.length} stories`);
    res.json({ stories });
  } catch (error) {
    Logger.Route.error("Failed to load stories", error);
    res.status(500).json({ error: "Failed to load stories" });
  }
});

// Get story details
router.get("/admin/stories/:id", verifyAdmin, async (req, res) => {
  try {
    const storyId = req.params.id;
    Logger.Route.log(`Fetching story details: ${storyId}`);
    const storyState = await adminStoryService.getStory(storyId);
    Logger.Route.log(`Successfully fetched story: ${storyId}`);
    res.json(storyState);
  } catch (error) {
    if ((error as Error).message === "Story not found") {
      Logger.Route.error(`Story not found: ${req.params.id}`);
      return res.status(404).json({ error: "Story not found" });
    }
    Logger.Route.error(`Failed to load story: ${req.params.id}`, error);
    res.status(500).json({ error: "Failed to load story" });
  }
});

// Delete story
router.delete("/admin/stories/:id", verifyAdmin, async (req, res) => {
  try {
    const storyId = req.params.id;
    Logger.Route.log(`Deleting story: ${storyId}`);
    await adminStoryService.deleteStory(storyId);
    Logger.Route.log(`Successfully deleted story: ${storyId}`);
    res.json({ success: true });
  } catch (error) {
    Logger.Route.error(`Failed to delete story: ${req.params.id}`, error);
    res.status(500).json({ error: "Failed to delete story" });
  }
});

// TEMPLATE MANAGEMENT

// Get all published templates
router.get("/templates", async (req, res) => {
  try {
    const allTemplates = await libraryService.getAllTemplates();

    // Check if the request is for welcome screen templates
    const forWelcomeScreen = req.query.forWelcomeScreen === "true";

    // Filter templates based on publication status and welcome screen flag
    const templates = allTemplates.filter((template) => {
      // Always require templates to be published
      const isPublished =
        template.publicationStatus === PublicationStatus.Published;

      // If requesting welcome screen templates, also check the showOnWelcomeScreen flag
      if (forWelcomeScreen) {
        return isPublished && template.showOnWelcomeScreen;
      }

      // Otherwise just return all published templates
      return isPublished;
    });

    Logger.Route.log(
      `Returning ${templates.length} templates${
        forWelcomeScreen ? " for welcome screen" : ""
      }`
    );
    res.json({ templates });
  } catch (error) {
    Logger.Route.error("Failed to load templates", error);
    res.status(500).json({ error: "Failed to load templates" });
  }
});

// Get template by ID (only if published)
router.get("/templates/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const template = await libraryService.getTemplateById(id);

    if (!template) {
      return res.status(404).json({ error: "Template not found" });
    }

    // Only return the template if it's published
    if (template.publicationStatus !== PublicationStatus.Published) {
      return res.status(404).json({ error: "Template not found" });
    }

    Logger.Route.log(`Serving published template ${id}`);
    res.json({ template });
  } catch (error) {
    Logger.Route.error(`Error retrieving template ${id}`, error);
    res.status(500).json({ error: "Failed to retrieve template" });
  }
});

// Admin - Get all templates
router.get("/admin/templates", verifyAdmin, async (req, res) => {
  try {
    const templates = await libraryService.getAllTemplates();
    Logger.Route.log(`Retrieved ${templates.length} templates`);
    res.json({ templates });
  } catch (error) {
    Logger.Route.error("Error retrieving templates", error);
    res.status(500).json({ error: "Failed to retrieve templates" });
  }
});

// Admin - Get template by ID
router.get("/admin/templates/:id", verifyAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const template = await libraryService.getTemplateById(id);

    if (!template) {
      return res.status(404).json({ error: "Template not found" });
    }

    Logger.Route.log(`Retrieved template ${id}`);
    res.json({ template });
  } catch (error) {
    Logger.Route.error(`Error retrieving template ${id}`, error);
    res.status(500).json({ error: "Failed to retrieve template" });
  }
});

// Create a new template
router.post("/admin/templates", verifyAdmin, async (req, res) => {
  const {
    playerCountMin,
    playerCountMax,
    gameMode,
    maxTurnsMin,
    maxTurnsMax,
    teaser,
    title,
    publicationStatus,
    showOnWelcomeScreen,
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
      publicationStatus: publicationStatus || PublicationStatus.Draft,
      showOnWelcomeScreen: showOnWelcomeScreen || false,
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

    Logger.Route.log(`Created template ${template.id}: ${title}`);
    res.status(201).json({ template });
  } catch (error) {
    Logger.Route.error("Error creating template", error);
    res.status(500).json({ error: "Failed to create template" });
  }
});

// Update a template
router.put("/admin/templates/:id", verifyAdmin, async (req, res) => {
  const { id } = req.params;
  const {
    playerCountMin,
    playerCountMax,
    gameMode,
    maxTurnsMin,
    maxTurnsMax,
    teaser,
    title,
    publicationStatus,
    showOnWelcomeScreen,
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
      publicationStatus: publicationStatus || PublicationStatus.Draft,
      showOnWelcomeScreen:
        showOnWelcomeScreen !== undefined ? showOnWelcomeScreen : false,
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

    Logger.Route.log(`Updated template ${id}: ${title}`);
    res.json({ template });
  } catch (error) {
    // Check if it's a not found error
    if ((error as Error).message.includes("not found")) {
      return res.status(404).json({ error: "Template not found" });
    }

    Logger.Route.error(`Error updating template ${id}`, error);
    res.status(500).json({ error: "Failed to update template" });
  }
});

// Delete a template
router.delete("/admin/templates/:id", verifyAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await libraryService.deleteTemplate(id);

    if (!result) {
      return res.status(404).json({ error: "Template not found" });
    }

    Logger.Route.log(`Deleted template ${id}`);
    res.json({ success: true });
  } catch (error) {
    // Check if it's a not found error
    if ((error as Error).message.includes("not found")) {
      return res.status(404).json({ error: "Template not found" });
    }

    Logger.Route.error(`Error deleting template ${id}`, error);
    res.status(500).json({ error: "Failed to delete template" });
  }
});

// Generate a template using AI
router.post("/admin/templates/generate", verifyAdmin, async (req, res) => {
  const { prompt, playerCount, maxTurns, gameMode } = req.body;

  if (!prompt || !playerCount || !maxTurns || !gameMode) {
    return res.status(400).json({
      error: "Missing required fields: prompt, playerCount, maxTurns, gameMode",
    });
  }

  try {
    Logger.Route.log(`Generating template with prompt: ${prompt}`);

    const template = await libraryService.generateTemplate(
      prompt,
      false,
      playerCount,
      maxTurns,
      gameMode
    );

    Logger.Route.log(`Generated template: ${template.title}`);
    res.status(201).json({ template });
  } catch (error) {
    Logger.Route.error("Error generating template", error);
    res.status(500).json({ error: "Failed to generate template" });
  }
});

// Catch-all 404 handler
router.use((req, res) => {
  Logger.Route.error(`404 Not Found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ error: "Route not found" });
});

export const Router = router;
