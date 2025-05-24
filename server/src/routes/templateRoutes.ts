import express from "express";
import { Logger } from "shared/logger.js";
import { PublicationStatus } from "core/types/index.js";
import { sendSuccess, sendError, sendNotFound } from "shared/responseUtils.js";
import { AdminTemplateService } from "server/admin/AdminTemplateService.js";

const router = express.Router();
const templateService = new AdminTemplateService();

// Get all published templates
router.get("/templates", async (req, res) => {
  const requestId = req.query.requestId as string;

  try {
    const allTemplates = await templateService.getAllTemplates();

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

// Get template by ID (only if published or private)
router.get("/templates/:id", async (req, res) => {
  const { id } = req.params;
  const requestId = req.query.requestId as string;

  try {
    const template = await templateService.getTemplateById(id);

    if (!template) {
      return sendNotFound(res, "Template not found", requestId);
    }

    // Only return the template if it's published or private
    if (
      template.publicationStatus !== PublicationStatus.Published &&
      template.publicationStatus !== PublicationStatus.Private
    ) {
      Logger.Route.log(`Template ${id} is not published or private`);
      return sendNotFound(res, "Template not found", requestId);
    }

    Logger.Route.log(`Serving published or private template ${id}`);
    sendSuccess(res, { template }, requestId);
  } catch (error) {
    Logger.Route.error(`Error retrieving template ${id}`, error);
    sendError(res, "Failed to retrieve template", 500, requestId, error);
  }
});

export default router;
