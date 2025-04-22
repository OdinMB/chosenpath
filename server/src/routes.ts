import express from "express";
import { config } from "./config.js";
import { Logger } from "shared/logger.js";
import {
  UpdateTemplateRequest,
  CreateTemplateRequest,
  DeleteTemplateRequest,
  GenerateTemplateRequest,
  TemplateIterationRequest,
  DeleteStoryRequest,
  PublicationStatus,
} from "core/types/index.js";

import {
  sendSuccess,
  sendError,
  sendBadRequest,
  sendNotFound,
} from "./shared/responseUtils.js";
import { adminStoryService } from "./admin/AdminStoryService.js";
import { AdminLibraryService } from "./admin/AdminLibraryService.js";

// Simple authentication middleware
export const verifyAdmin = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  const authHeader = req.headers.authorization;
  const requestId =
    (req.query.requestId as string) ||
    (req.body && req.body.requestId) ||
    "unknown";

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    Logger.Route.error(
      "Authentication failed: missing or invalid Authorization header"
    );
    return sendError(res, "Authentication required", 401, requestId);
  }

  const token = authHeader.split(" ")[1];

  // Simple password check - should be replaced with a more secure method in production
  if (token !== config.adminPassword) {
    Logger.Route.error("Authentication failed: invalid password");
    return sendError(res, "Invalid credentials", 403, requestId);
  }

  Logger.Route.log("Authentication successful");
  next();
};

const router = express.Router();
const libraryService = new AdminLibraryService();

// Auth check route
router.get("/admin/auth", verifyAdmin, (req, res) => {
  Logger.Route.log("Auth check successful");
  sendSuccess(res, { authenticated: true }, req.query.requestId as string);
});

// STORY MANAGEMENT

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

// TEMPLATE MANAGEMENT

// Get all published templates
router.get("/templates", async (req, res) => {
  const requestId = req.query.requestId as string;

  try {
    const allTemplates = await libraryService.getAllTemplates();

    // Check if the request is for welcome screen templates
    const forWelcomeScreen = req.query.forWelcomeScreen === "true";

    // Filter templates based on publication status and welcome screen flag
    let templates = allTemplates.filter((template) => {
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

    // If retrieving templates for the welcome screen, sort them by order
    if (forWelcomeScreen) {
      templates = templates.sort((a, b) => {
        // Handle undefined order values
        const orderA =
          a.order !== undefined ? a.order : Number.MAX_SAFE_INTEGER;
        const orderB =
          b.order !== undefined ? b.order : Number.MAX_SAFE_INTEGER;
        return orderA - orderB;
      });
    }

    Logger.Route.log(
      `Returning ${templates.length} templates${
        forWelcomeScreen ? " for welcome screen" : ""
      }`
    );
    sendSuccess(res, { templates }, requestId);
  } catch (error) {
    Logger.Route.error("Failed to load templates", error);
    sendError(res, "Failed to load templates", 500, requestId, error);
  }
});

// Get template by ID (only if published)
router.get("/templates/:id", async (req, res) => {
  const { id } = req.params;
  const requestId = req.query.requestId as string;

  try {
    const template = await libraryService.getTemplateById(id);

    if (!template) {
      return sendNotFound(res, "Template not found", requestId);
    }

    // Only return the template if it's published
    if (template.publicationStatus !== PublicationStatus.Published) {
      return sendNotFound(res, "Template not found", requestId);
    }

    Logger.Route.log(`Serving published template ${id}`);
    sendSuccess(res, { template }, requestId);
  } catch (error) {
    Logger.Route.error(`Error retrieving template ${id}`, error);
    sendError(res, "Failed to retrieve template", 500, requestId, error);
  }
});

// Admin - Get all templates
router.get("/admin/templates", verifyAdmin, async (req, res) => {
  try {
    const requestId = req.query.requestId as string;
    const templates = await libraryService.getAllTemplates();
    Logger.Route.log(`Retrieved ${templates.length} templates`);
    sendSuccess(res, { templates }, requestId);
  } catch (error) {
    Logger.Route.error("Error retrieving templates", error);
    sendError(
      res,
      "Failed to retrieve templates",
      500,
      req.query.requestId as string,
      error
    );
  }
});

// Admin - Get template by ID
router.get("/admin/templates/:id", verifyAdmin, async (req, res) => {
  const { id } = req.params;
  const requestId = req.query.requestId as string;

  try {
    const template = await libraryService.getTemplateById(id);

    if (!template) {
      return sendNotFound(res, "Template not found", requestId);
    }

    Logger.Route.log(`Retrieved template ${id}`);
    sendSuccess(res, { template }, requestId);
  } catch (error) {
    Logger.Route.error(`Error retrieving template ${id}`, error);
    sendError(res, "Failed to retrieve template", 500, requestId, error);
  }
});

// Create a new template
router.post("/admin/templates", verifyAdmin, async (req, res) => {
  const requestId = req.body?.requestId || "unknown";

  try {
    const { template } = req.body as CreateTemplateRequest;

    if (!template) {
      return sendBadRequest(res, "Missing template data", requestId);
    }

    const createdTemplate = await libraryService.createTemplate(template);

    Logger.Route.log(
      `Created template ${createdTemplate.id}: ${createdTemplate.title}`
    );
    sendSuccess(res, { template: createdTemplate }, requestId, 201);
  } catch (error) {
    Logger.Route.error("Error creating template", error);
    sendError(res, "Failed to create template", 500, requestId, error);
  }
});

// Update a template
router.put("/admin/templates/:id", verifyAdmin, async (req, res) => {
  const { id } = req.params;
  const requestId = req.body?.requestId || "unknown";

  try {
    const { template } = req.body as UpdateTemplateRequest;
    if (!template) {
      return sendBadRequest(res, "Missing template data", requestId);
    }

    const updatedTemplate = await libraryService.updateTemplate(id, template);

    Logger.Route.log(`Updated template ${id}: ${updatedTemplate.title}`);
    sendSuccess(res, { template: updatedTemplate }, requestId);
  } catch (error) {
    // Check if it's a not found error
    if ((error as Error).message.includes("not found")) {
      return sendNotFound(res, "Template not found", requestId);
    }
    Logger.Route.error(`Error updating template ${id}`, error);
    sendError(res, "Failed to update template", 500, requestId, error);
  }
});

// Delete a template
router.delete("/admin/templates/:id", verifyAdmin, async (req, res) => {
  const { id } = req.params;
  const requestId = req.body?.requestId || "unknown";

  try {
    const deleteRequest = req.body as DeleteTemplateRequest;
    const result = await libraryService.deleteTemplate(id);

    if (!result) {
      return sendNotFound(res, "Template not found", requestId);
    }

    Logger.Route.log(`Deleted template ${id}`);
    sendSuccess(res, { success: true }, requestId);
  } catch (error) {
    // Check if it's a not found error
    if ((error as Error).message.includes("not found")) {
      return sendNotFound(res, "Template not found", requestId);
    }

    Logger.Route.error(`Error deleting template ${id}`, error);
    sendError(res, "Failed to delete template", 500, requestId, error);
  }
});

// Generate a template using AI
router.post("/admin/templates/generate", verifyAdmin, async (req, res) => {
  const requestId = req.body?.requestId || "unknown";

  try {
    const { prompt, playerCount, maxTurns, gameMode, generateImages } =
      req.body as GenerateTemplateRequest;

    if (!prompt || !playerCount || !maxTurns || !gameMode) {
      return sendBadRequest(
        res,
        "Missing required fields: prompt, playerCount, maxTurns, gameMode",
        requestId
      );
    }

    Logger.Route.log(`Generating template with prompt: ${prompt}`);

    const template = await libraryService.generateTemplate(
      prompt,
      generateImages || false,
      playerCount,
      maxTurns,
      gameMode
    );

    Logger.Route.log(`Generated template: ${template.title}`);
    sendSuccess(res, { template }, requestId, 201);
  } catch (error) {
    Logger.Route.error("Error generating template", error);
    sendError(res, "Failed to generate template", 500, requestId, error);
  }
});

// Iterate on a template with AI
router.post("/admin/templates/:id/iterate", verifyAdmin, async (req, res) => {
  const { id } = req.params;
  const requestId = req.body?.requestId || "unknown";

  try {
    const { feedback, sections, gameMode, playerCount, maxTurns } =
      req.body as TemplateIterationRequest;

    if (
      !feedback ||
      !sections ||
      !sections.length ||
      !gameMode ||
      !playerCount ||
      !maxTurns
    ) {
      return sendBadRequest(
        res,
        "Missing required fields: feedback, sections, gameMode, playerCount, maxTurns",
        requestId
      );
    }

    // Check if template exists
    const template = await libraryService.getTemplateById(id);
    if (!template) {
      return sendNotFound(res, `Template with ID ${id} not found`, requestId);
    }

    const templateUpdate = await libraryService.iterateTemplate(
      id,
      feedback,
      sections,
      gameMode,
      playerCount,
      maxTurns
    );

    Logger.Route.log(`Generated iteration for template ${id}`);
    sendSuccess(res, { templateUpdate }, requestId);
  } catch (error) {
    Logger.Route.error(`Error iterating template ${id}`, error);
    sendError(res, `Failed to iterate template ${id}`, 500, requestId, error);
  }
});

// Catch-all 404 handler
router.use((req, res) => {
  const requestId =
    (req.query.requestId as string) ||
    (req.body && req.body.requestId) ||
    "unknown";

  Logger.Route.error(`404 Not Found: ${req.method} ${req.originalUrl}`);
  sendNotFound(res, "Route not found", requestId);
});

export const Router = router;
