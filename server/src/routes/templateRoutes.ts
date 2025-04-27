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
  PublicationStatus,
  ExportTemplateAssetsRequest,
  ExportAllTemplatesAssetsRequest,
  UploadTemplateFileRequest,
  ImportTemplateFilesRequest,
} from "core/types/index.js";
import {
  sendSuccess,
  sendError,
  sendBadRequest,
  sendNotFound,
} from "shared/responseUtils.js";
import { AdminTemplateService } from "server/admin/AdminTemplateService.js";
import {
  getStoragePath,
  extractZip,
  createZipFromDirectory,
  addDirectoryToZip,
} from "shared/storageUtils.js";
import { verifyAdmin } from "./auth.js";

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage });

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

// Get template by ID (only if published)
router.get("/templates/:id", async (req, res) => {
  const { id } = req.params;
  const requestId = req.query.requestId as string;

  try {
    const template = await templateService.getTemplateById(id);

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
    const templates = await templateService.getAllTemplates();
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

// Admin - Get all templates with their assets
router.get("/admin/templates/all/assets", verifyAdmin, async (req, res) => {
  const requestId = req.query.requestId as string;
  const request = { requestId } as ExportAllTemplatesAssetsRequest;

  try {
    // Get all templates to check if any exist
    const templates = await templateService.getAllTemplates();
    if (templates.length === 0) {
      return sendSuccess(res, { message: "No templates found" }, requestId);
    }

    // Create archive with all templates
    const zip = new JSZip();

    // Get the templates directory
    const templatesBasePath = getStoragePath("templates");

    // Check if directory exists
    if (!fsSync.existsSync(templatesBasePath)) {
      return sendError(res, "Templates directory not found", 500, requestId);
    }

    // Get all directories in the templates directory
    const items = await fs.readdir(templatesBasePath, { withFileTypes: true });
    const templateDirs = items
      .filter((item) => item.isDirectory())
      .map((item) => item.name);

    if (templateDirs.length === 0) {
      return sendSuccess(
        res,
        { message: "No template directories found" },
        requestId
      );
    }

    // Process each template directory
    for (const dirName of templateDirs) {
      const templateDir = path.join(templatesBasePath, dirName);

      // Skip if not a directory or doesn't exist
      if (
        !fsSync.existsSync(templateDir) ||
        !fsSync.statSync(templateDir).isDirectory()
      ) {
        continue;
      }

      try {
        // Add all files and subdirectories for this template
        await addDirectoryToZip(templateDir, dirName, zip);
      } catch (error) {
        Logger.Route.error(
          `Error adding template directory ${dirName} to zip`,
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
      `attachment; filename="all-templates-${
        new Date().toISOString().split("T")[0]
      }.zip"`
    );

    // Send the zip file
    res.send(zipBuffer);

    Logger.Route.log(`Exported all templates as zip (with subdirectories)`);
  } catch (error) {
    Logger.Route.error("Error exporting all templates", error);
    sendError(res, "Failed to export templates", 500, requestId, error);
  }
});

// Admin - Get template by ID
router.get("/admin/templates/:id", verifyAdmin, async (req, res) => {
  const { id } = req.params;
  const requestId = req.query.requestId as string;

  try {
    const template = await templateService.getTemplateById(id);

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

// Admin - Get all assets for a template (images, etc.)
router.get("/admin/templates/:id/assets", verifyAdmin, async (req, res) => {
  const { id } = req.params;
  const requestId = req.query.requestId as string;
  const request = { id, requestId } as ExportTemplateAssetsRequest;

  try {
    // Check if template exists
    const template = await templateService.getTemplateById(id);
    if (!template) {
      return sendNotFound(res, "Template not found", requestId);
    }

    // Get template directory path
    const templatesBasePath = getStoragePath("templates");
    const templateDir = path.join(templatesBasePath, id);

    // Check if directory exists
    if (!fsSync.existsSync(templateDir)) {
      return sendError(res, "Template directory not found", 404, requestId);
    }

    // Create zip archive of the directory
    const zipBuffer = await createZipFromDirectory(templateDir);

    // Set download headers
    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${template.title
        .replace(/\s+/g, "-")
        .toLowerCase()}.zip"`
    );

    // Send the zip file
    res.send(zipBuffer);

    Logger.Route.log(
      `Exported template ${id} directory as zip (with subdirectories)`
    );
  } catch (error) {
    Logger.Route.error(`Error exporting template ${id}`, error);
    sendError(res, "Failed to export template", 500, requestId, error);
  }
});

// Create a new template
router.post("/admin/templates", verifyAdmin, async (req, res) => {
  const requestId = req.body?.requestId || "unknown";
  const createRequest = req.body as CreateTemplateRequest;

  try {
    const { template } = createRequest;

    if (!template) {
      return sendBadRequest(res, "Missing template data", requestId);
    }

    const createdTemplate = await templateService.createTemplate(template);

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
  const updateRequest = req.body as UpdateTemplateRequest;

  try {
    const { template } = updateRequest;
    if (!template) {
      return sendBadRequest(res, "Missing template data", requestId);
    }

    const updatedTemplate = await templateService.updateTemplate(id, template);

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
});

// Generate a template using AI
router.post("/admin/templates/generate", verifyAdmin, async (req, res) => {
  const requestId = req.body?.requestId || "unknown";
  const generateRequest = req.body as GenerateTemplateRequest;

  try {
    const { prompt, playerCount, maxTurns, gameMode, generateImages } =
      generateRequest;

    if (!prompt || !playerCount || !maxTurns || !gameMode) {
      return sendBadRequest(
        res,
        "Missing required fields: prompt, playerCount, maxTurns, gameMode",
        requestId
      );
    }

    Logger.Route.log(`Generating template with prompt: ${prompt}`);

    const template = await templateService.generateTemplate(
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
});

// Upload a file to a template directory (respecting subdirectories)
router.post(
  "/admin/templates/:id/files",
  verifyAdmin,
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
  "/admin/templates/:id/import",
  verifyAdmin,
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
