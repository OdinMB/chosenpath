import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs/promises";
import fsSync from "fs";
import os from "os";
import JSZip from "jszip";
import { Logger } from "shared/logger.js";
import {
  UpdateTemplateRequest,
  CreateTemplateRequest,
  DeleteTemplateRequest,
  GenerateTemplateRequest,
  TemplateIterationRequest,
  ExportTemplateAssetsRequest,
  UploadTemplateFileRequest,
  ImportTemplateFilesRequest,
  PublicationStatus,
} from "core/types/index.js";
import {
  sendSuccess,
  sendError,
  sendBadRequest,
  sendNotFound,
} from "shared/responseUtils.js";
import { TemplateService } from "./TemplateService.js";
import { templateDbService } from "./TemplateDbService.js";
import {
  getStoragePath,
  extractZip,
  createZipFromDirectory,
  addDirectoryToZip,
} from "shared/storageUtils.js";
import { verifyUser, hasPermissions } from "../users/authMiddleware.js";
import {
  verifyTemplateAccess,
  verifyTemplateEditAccess,
  verifyTemplateCreatePermission,
  verifyPublicationStatusPermission,
  verifyCarouselPermission,
  verifyImageGenerationPermission,
} from "./templateMiddleware.js";

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage });

const router = express.Router();
const templateService = new TemplateService();

// ========================
// PUBLIC TEMPLATE ROUTES (NO AUTH)
// ========================

// Get all published templates (public endpoint)
router.get("/templates/published", async (req, res) => {
  const requestId = req.query.requestId as string;

  try {
    // Check if the request is for welcome screen templates
    const forWelcomeScreen = req.query.forWelcomeScreen === "true";

    let templates;
    if (forWelcomeScreen) {
      // Use the new database-backed method to get carousel templates
      templates = await templateService.getCarouselTemplates();
    } else {
      // Use the new database-backed method to get published templates
      templates = await templateService.getTemplatesByStatus(
        PublicationStatus.Published
      );
    }

    Logger.Route.log(
      `Returning ${templates.length} published templates${
        forWelcomeScreen ? " for welcome screen" : ""
      }`
    );
    sendSuccess(res, { templates }, requestId);
  } catch (error) {
    Logger.Route.error("Failed to load published templates", error);
    sendError(res, "Failed to load templates", 500, requestId, error);
  }
});

// Get template by ID (only if published or private, no auth required)
router.get("/templates/playable/:id", async (req, res) => {
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

    Logger.Route.log(`Serving playable template ${id}`);
    sendSuccess(res, { template }, requestId);
  } catch (error) {
    Logger.Route.error(`Error retrieving template ${id}`, error);
    sendError(res, "Failed to retrieve template", 500, requestId, error);
  }
});

// ========================
// AUTHENTICATED ROUTES (USER ONLY)
// ========================

// Get all templates for the current user
router.get("/templates/user", verifyUser(), async (req, res) => {
  const requestId = req.query.requestId as string;

  try {
    if (!req.user) {
      return sendError(res, "User not authenticated", 401, requestId);
    }

    // Use the new database-backed method to get templates by creator
    const templates = await templateService.getTemplatesByCreator(req.user.id);

    Logger.Route.log(
      `User ${req.user.id} accessed their ${templates.length} templates`
    );
    sendSuccess(res, { templates }, requestId);
  } catch (error) {
    Logger.Route.error("Failed to load user templates", error);
    sendError(res, "Failed to load templates", 500, requestId, error);
  }
});

// Get templates for a specific user
router.get("/templates/user/:userId", verifyUser(), async (req, res) => {
  const { userId } = req.params;
  const requestId = req.query.requestId as string;

  try {
    if (!req.user) {
      return sendError(res, "User not authenticated", 401, requestId);
    }

    // Users can only access their own templates unless they have see_all permission
    if (userId !== req.user.id && !hasPermissions(req, ["templates_see_all"])) {
      return sendError(res, "Insufficient permissions", 403, requestId);
    }

    // Use the new database-backed method to get templates by creator
    const templates = await templateService.getTemplatesByCreator(userId);

    Logger.Route.log(
      `Retrieved ${templates.length} templates for user ${userId}`
    );
    sendSuccess(res, { templates }, requestId);
  } catch (error) {
    Logger.Route.error(`Failed to load templates for user ${userId}`, error);
    sendError(res, "Failed to load templates", 500, requestId, error);
  }
});

// ========================
// ADMIN ROUTES (REQUIRES PERMISSIONS)
// ========================

// Get all templates (requires templates_see_all permission)
router.get("/templates", verifyUser(), async (req, res) => {
  const requestId = req.query.requestId as string;

  try {
    // Check if user has see_all permission
    if (!hasPermissions(req, ["templates_see_all"])) {
      return sendError(
        res,
        "Insufficient permissions to view all templates",
        403,
        requestId
      );
    }

    const templates = await templateService.getAllTemplates();
    Logger.Route.log(`Retrieved all ${templates.length} templates`);
    sendSuccess(res, { templates }, requestId);
  } catch (error) {
    Logger.Route.error("Error retrieving all templates", error);
    sendError(
      res,
      "Failed to retrieve templates",
      500,
      req.query.requestId as string,
      error
    );
  }
});

// Get template by ID (if user has access)
router.get(
  "/templates/:id",
  verifyUser(),
  verifyTemplateAccess(),
  async (req, res) => {
    const { id } = req.params;
    const requestId = req.query.requestId as string;

    try {
      const template = await templateService.getTemplateById(id);

      if (!template) {
        return sendNotFound(res, "Template not found", requestId);
      }

      Logger.Route.log(`User ${req.user?.id} accessed template ${id}`);
      sendSuccess(res, { template }, requestId);
    } catch (error) {
      Logger.Route.error(`Error retrieving template ${id}`, error);
      sendError(res, "Failed to retrieve template", 500, requestId, error);
    }
  }
);

// Export templates by IDs
router.get("/templates/export", verifyUser(), async (req, res) => {
  const requestId = req.query.requestId as string;
  const templateIds = req.query.templateIds as string | undefined;
  const selectedTemplateIds = templateIds ? templateIds.split(",") : [];

  try {
    // If no template IDs provided, return error
    if (!selectedTemplateIds.length) {
      return sendError(res, "No template IDs provided", 400, requestId);
    }

    // Check permissions
    // If the user has the templates_see_all permission, they can export any template
    const canSeeAll = hasPermissions(req, ["templates_see_all"]);

    // If the user doesn't have the templates_create permission, they can't export any templates
    if (!hasPermissions(req, ["templates_create"]) && !canSeeAll) {
      return sendError(
        res,
        "Insufficient permissions to export templates",
        403,
        requestId
      );
    }

    // Create archive with selected templates
    const zip = new JSZip();

    // Get the templates directory
    const templatesBasePath = getStoragePath("templates");

    // Check if directory exists
    if (!fsSync.existsSync(templatesBasePath)) {
      return sendError(res, "Templates directory not found", 500, requestId);
    }

    // Get template metadata once for efficient permission checking
    const templateMetadata =
      !canSeeAll && req.user ? await templateService.getTemplateMetadata() : [];

    // Process each template directory
    for (const templateId of selectedTemplateIds) {
      // Verify template exists and check permissions using database metadata
      const template = await templateService.getTemplateById(templateId);
      if (!template) {
        Logger.Route.warn(`Template ${templateId} not found, skipping`);
        continue;
      }

      // Permission checks using database metadata:
      if (!canSeeAll && req.user) {
        const templateMeta = templateMetadata.find((t) => t.id === templateId);

        if (templateMeta) {
          const isCreator = templateMeta.creatorId === req.user.id;

          if (
            !isCreator &&
            templateMeta.publicationStatus !== PublicationStatus.Published &&
            templateMeta.publicationStatus !== PublicationStatus.Private
          ) {
            Logger.Route.warn(
              `User ${req.user.id} doesn't have permission to export template ${templateId}, skipping`
            );
            continue;
          }
        }
      }

      const templateDir = path.join(templatesBasePath, templateId);

      // Skip if not a directory or doesn't exist
      if (
        !fsSync.existsSync(templateDir) ||
        !fsSync.statSync(templateDir).isDirectory()
      ) {
        continue;
      }

      try {
        // Add all files and subdirectories for this template
        await addDirectoryToZip(templateDir, templateId, zip);
      } catch (error) {
        Logger.Route.error(
          `Error adding template directory ${templateId} to zip`,
          error
        );
        // Continue with other templates
      }
    }

    // Generate the zip file
    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

    // Set download headers
    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="templates-${
        new Date().toISOString().split("T")[0]
      }.zip"`
    );

    // Send the zip file
    res.send(zipBuffer);

    Logger.Route.log(`Exported ${selectedTemplateIds.length} templates as zip`);
  } catch (error) {
    Logger.Route.error("Error exporting templates", error);
    sendError(res, "Failed to export templates", 500, requestId, error);
  }
});

// Export templates by IDs - POST endpoint
router.post("/templates/export", verifyUser(), async (req, res) => {
  const requestId = req.body?.requestId || "unknown";
  const { templateIds } = req.body;
  const selectedTemplateIds = templateIds || [];

  try {
    // If no template IDs provided, return error
    if (!selectedTemplateIds.length) {
      return sendError(res, "No template IDs provided", 400, requestId);
    }

    // Check permissions
    // If the user has the templates_see_all permission, they can export any template
    const canSeeAll = hasPermissions(req, ["templates_see_all"]);

    // If the user doesn't have the templates_create permission, they can't export any templates
    if (!hasPermissions(req, ["templates_create"]) && !canSeeAll) {
      return sendError(
        res,
        "Insufficient permissions to export templates",
        403,
        requestId
      );
    }

    // Create archive with selected templates
    const zip = new JSZip();

    // Get the templates directory
    const templatesBasePath = getStoragePath("templates");

    // Check if directory exists
    if (!fsSync.existsSync(templatesBasePath)) {
      return sendError(res, "Templates directory not found", 500, requestId);
    }

    // Get template metadata once for efficient permission checking
    const templateMetadata =
      !canSeeAll && req.user ? await templateService.getTemplateMetadata() : [];

    // Process each template directory
    for (const templateId of selectedTemplateIds) {
      // Verify template exists and check permissions using database metadata
      const template = await templateService.getTemplateById(templateId);
      if (!template) {
        Logger.Route.warn(`Template ${templateId} not found, skipping`);
        continue;
      }

      // Permission checks using database metadata:
      if (!canSeeAll && req.user) {
        const templateMeta = templateMetadata.find((t) => t.id === templateId);

        if (templateMeta) {
          const isCreator = templateMeta.creatorId === req.user.id;

          if (
            !isCreator &&
            templateMeta.publicationStatus !== PublicationStatus.Published &&
            templateMeta.publicationStatus !== PublicationStatus.Private
          ) {
            Logger.Route.warn(
              `User ${req.user.id} doesn't have permission to export template ${templateId}, skipping`
            );
            continue;
          }
        }
      }

      const templateDir = path.join(templatesBasePath, templateId);

      // Skip if not a directory or doesn't exist
      if (
        !fsSync.existsSync(templateDir) ||
        !fsSync.statSync(templateDir).isDirectory()
      ) {
        continue;
      }

      try {
        // Add all files and subdirectories for this template
        await addDirectoryToZip(templateDir, templateId, zip);
      } catch (error) {
        Logger.Route.error(
          `Error adding template directory ${templateId} to zip`,
          error
        );
        // Continue with other templates
      }
    }

    // Generate the zip file
    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

    // Set download headers
    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="templates-${
        new Date().toISOString().split("T")[0]
      }.zip"`
    );

    // Send the zip file
    res.send(zipBuffer);

    Logger.Route.log(`Exported ${selectedTemplateIds.length} templates as zip`);
  } catch (error) {
    Logger.Route.error("Error exporting templates", error);
    sendError(res, "Failed to export templates", 500, requestId, error);
  }
});

// ========================
// TEMPLATE MODIFICATION ROUTES
// ========================

// Create a new template
router.post(
  "/templates",
  verifyUser(),
  (req, res, next) => verifyTemplateCreatePermission(req, res, next),
  async (req, res) => {
    const requestId = req.body?.requestId || "unknown";
    const createRequest = req.body as CreateTemplateRequest;

    try {
      const { template } = createRequest;

      if (!template) {
        return sendBadRequest(res, "Missing template data", requestId);
      }

      // Pass creator ID to the service method
      const creatorId = req.user?.id;
      const createdTemplate = await templateService.createTemplate(
        template,
        creatorId
      );

      Logger.Route.log(
        `Created template ${createdTemplate.id}: ${createdTemplate.title}`
      );
      sendSuccess(res, { template: createdTemplate }, requestId, 201);
    } catch (error) {
      Logger.Route.error("Error creating template", error);
      sendError(res, "Failed to create template", 500, requestId, error);
    }
  }
);

// Update a template
router.put(
  "/templates/:id",
  verifyUser(),
  verifyTemplateEditAccess(),
  (req, res, next) => verifyPublicationStatusPermission(req, res, next),
  (req, res, next) => verifyCarouselPermission(req, res, next),
  async (req, res) => {
    const { id } = req.params;
    const requestId = req.body?.requestId || "unknown";
    const updateRequest = req.body as UpdateTemplateRequest;

    try {
      const { template } = updateRequest;
      if (!template) {
        return sendBadRequest(res, "Missing template data", requestId);
      }

      const updatedTemplate = await templateService.updateTemplate(
        id,
        template
      );

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
  }
);

// Delete a template
router.delete(
  "/templates/:id",
  verifyUser(),
  verifyTemplateEditAccess(),
  async (req, res) => {
    const { id } = req.params;
    const requestId = req.body?.requestId || "unknown";
    const deleteRequest = req.body as DeleteTemplateRequest;

    try {
      const result = await templateService.deleteTemplate(id);

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
  }
);

// ========================
// AI GENERATION ROUTES
// ========================

// Generate a template using AI
router.post(
  "/templates/generate",
  verifyUser(),
  (req, res, next) => verifyTemplateCreatePermission(req, res, next),
  (req, res, next) => verifyImageGenerationPermission(req, res, next),
  async (req, res) => {
    const requestId = req.body?.requestId || "unknown";
    const generateRequest = req.body as GenerateTemplateRequest;

    try {
      const {
        prompt,
        playerCount,
        maxTurns,
        gameMode,
        generateImages,
        difficultyLevel,
      } = generateRequest;

      if (
        !prompt ||
        !playerCount ||
        !maxTurns ||
        !gameMode ||
        !difficultyLevel
      ) {
        return sendBadRequest(
          res,
          "Missing required fields: prompt, playerCount, maxTurns, gameMode, difficultyLevel",
          requestId
        );
      }

      Logger.Route.log(`Generating template with prompt: ${prompt}`);

      const creatorId = req.user?.id;
      const template = await templateService.generateTemplate(
        prompt,
        generateImages || false,
        playerCount,
        maxTurns,
        gameMode,
        difficultyLevel,
        creatorId
      );

      Logger.Route.log(`Generated template: ${template.title}`);
      sendSuccess(res, { template }, requestId, 201);
    } catch (error) {
      Logger.Route.error("Error generating template", error);
      sendError(res, "Failed to generate template", 500, requestId, error);
    }
  }
);

// Iterate on a template with AI
router.post(
  "/templates/:id/iterate",
  verifyUser(),
  verifyTemplateEditAccess(),
  (req, res, next) => verifyImageGenerationPermission(req, res, next),
  async (req, res) => {
    const { id } = req.params;
    const requestId = req.body?.requestId || "unknown";
    const iterationRequest = req.body as TemplateIterationRequest;

    try {
      const { feedback, sections, gameMode, playerCount, maxTurns } =
        iterationRequest;

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
      const template = await templateService.getTemplateById(id);
      if (!template) {
        return sendNotFound(res, `Template with ID ${id} not found`, requestId);
      }

      const templateUpdate = await templateService.iterateTemplate(
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
  }
);

// ========================
// FILE OPERATIONS ROUTES
// ========================

// Upload a file to a template directory (respecting subdirectories)
router.post(
  "/templates/:id/files",
  verifyUser(),
  verifyTemplateEditAccess(),
  upload.single("file"),
  async (req, res) => {
    const { id } = req.params;
    const requestId = req.query.requestId as string;

    // Access file from req.file (type cast to any to bypass TS issues)
    const uploadedFile = (req as any).file;
    // Get optional subdirectory from query params - this will be a path like "images" or "sounds/background"
    const subdir = (req.query.subdir as string) || "";

    // For type safety (client-side will have the full types)
    const uploadRequest = {
      id,
      requestId,
      file: uploadedFile,
      subdir,
    } as unknown as UploadTemplateFileRequest;

    if (!uploadedFile) {
      return sendBadRequest(res, "No file provided", requestId);
    }

    try {
      // Check if template exists
      const template = await templateService.getTemplateById(id);
      if (!template) {
        return sendNotFound(res, "Template not found", requestId);
      }

      // Get the template directory path
      const templatesBasePath = getStoragePath("templates");
      const templateDir = path.join(templatesBasePath, id);

      // Create target directory including any subdirectories
      let targetDir = templateDir;
      if (subdir) {
        // Security check to prevent directory traversal
        if (subdir.includes("..")) {
          return sendError(res, "Invalid subdirectory path", 400, requestId);
        }

        // Create the full target directory path
        targetDir = path.join(templateDir, subdir);

        // Ensure the subdirectory exists
        if (!fsSync.existsSync(targetDir)) {
          await fs.mkdir(targetDir, { recursive: true });
        }
      } else {
        // Ensure the template directory exists
        if (!fsSync.existsSync(templateDir)) {
          await fs.mkdir(templateDir, { recursive: true });
        }
      }

      // Write the file to the target directory
      const filePath = path.join(targetDir, uploadedFile.originalname);
      await fs.writeFile(filePath, uploadedFile.buffer);

      const relativePath = subdir
        ? `${subdir}/${uploadedFile.originalname}`
        : uploadedFile.originalname;

      Logger.Route.log(`File ${relativePath} uploaded to template ${id}`);

      // Send typed response
      sendSuccess(
        res,
        {
          success: true,
          path: relativePath,
        },
        requestId
      );
    } catch (error) {
      Logger.Route.error(`Error uploading file to template ${id}`, error);
      sendError(res, "Failed to upload file", 500, requestId, error);
    }
  }
);

// Import template files from a zip archive
router.post(
  "/templates/:id/import",
  verifyUser(),
  verifyTemplateEditAccess(),
  upload.single("zip"),
  async (req, res) => {
    const { id } = req.params;
    const requestId = req.query.requestId as string;

    // Access file from req.file (type cast to any to bypass TS issues)
    const uploadedFile = (req as any).file;

    // For type safety (client-side will have the full types)
    const importRequest = {
      id,
      requestId,
      zipFile: uploadedFile,
    } as unknown as ImportTemplateFilesRequest;

    if (!uploadedFile) {
      return sendBadRequest(res, "No zip file provided", requestId);
    }

    if (!uploadedFile.originalname.endsWith(".zip")) {
      return sendBadRequest(
        res,
        "Uploaded file must be a zip archive",
        requestId
      );
    }

    try {
      // Check if template exists
      const template = await templateService.getTemplateById(id);
      if (!template) {
        return sendNotFound(res, "Template not found", requestId);
      }

      // Get the template directory path
      const templatesBasePath = getStoragePath("templates");
      const templateDir = path.join(templatesBasePath, id);

      // Ensure the template directory exists
      if (!fsSync.existsSync(templateDir)) {
        await fs.mkdir(templateDir, { recursive: true });
      }

      // Create a temporary file for the zip
      const tempZipPath = path.join(
        os.tmpdir(),
        `template-import-${id}-${Date.now()}.zip`
      );
      await fs.writeFile(tempZipPath, uploadedFile.buffer);

      // Extract the zip to the template directory
      const zipEntries = await extractZip(tempZipPath, templateDir);

      // Clean up temporary zip file
      await fs.unlink(tempZipPath);

      // Update database to reflect if template now contains images
      const containsImages = await templateService.checkTemplateContainsImages(
        id
      );
      await templateDbService.updateTemplateEntry(id, { containsImages });

      Logger.Route.log(`Imported ${zipEntries.length} files to template ${id}`);

      // Send typed response
      sendSuccess(
        res,
        {
          success: true,
          filesImported: zipEntries.length,
          files: zipEntries,
        },
        requestId
      );
    } catch (error) {
      Logger.Route.error(`Error importing files to template ${id}`, error);
      sendError(res, "Failed to import files", 500, requestId, error);
    }
  }
);

export default router;
