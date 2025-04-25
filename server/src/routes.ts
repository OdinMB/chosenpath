/// <reference types="multer" />

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
} from "shared/responseUtils.js";
import { adminStoryService } from "admin/AdminStoryService.js";
import { AdminLibraryService } from "admin/AdminLibraryService.js";
import path from "path";
import fsSync from "fs";
import fs from "fs/promises";
import JSZip from "jszip";
import { getStoragePath } from "shared/storageUtils.js";
import multer from "multer";
import os from "os";

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage });

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

// Admin - Get all templates with their assets
router.get("/admin/templates/all/assets", verifyAdmin, async (req, res) => {
  const requestId = req.query.requestId as string;

  try {
    // Get all templates to check if any exist
    const templates = await libraryService.getAllTemplates();
    if (templates.length === 0) {
      return sendSuccess(res, { message: "No templates found" }, requestId);
    }

    // Create archive with all templates
    const zip = new JSZip();

    // Get the templates directory
    const templatesBasePath = getStoragePath("library");

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

    // Function to recursively add files and subdirectories to zip
    const addDirectoryToZip = async (sourceDir: string, zipPath: string) => {
      const entries = await fs.readdir(sourceDir, { withFileTypes: true });

      for (const entry of entries) {
        const sourcePath = path.join(sourceDir, entry.name);
        const targetPath = `${zipPath}/${entry.name}`;

        if (entry.isDirectory()) {
          // Recursively process subdirectory
          await addDirectoryToZip(sourcePath, targetPath);
        } else {
          // Add file to zip
          const fileData = await fs.readFile(sourcePath);
          zip.file(targetPath, fileData);
        }
      }
    };

    // Process each template directory
    for (const dirName of templateDirs) {
      const templateDir = path.join(templatesBasePath, dirName);

      // Skip if not a directory
      if (
        !fsSync.existsSync(templateDir) ||
        !fsSync.statSync(templateDir).isDirectory()
      ) {
        continue;
      }

      try {
        // Add all files and subdirectories for this template
        await addDirectoryToZip(templateDir, dirName);
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

    if (!uploadedFile) {
      return sendBadRequest(res, "No file provided", requestId);
    }

    try {
      // Check if template exists
      const template = await libraryService.getTemplateById(id);
      if (!template) {
        return sendNotFound(res, "Template not found", requestId);
      }

      // Get the template directory path
      const templatesBasePath = getStoragePath("library");
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
      const template = await libraryService.getTemplateById(id);
      if (!template) {
        return sendNotFound(res, "Template not found", requestId);
      }

      // Get the template directory path
      const templatesBasePath = getStoragePath("library");
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

// Helper function to extract a zip file
async function extractZip(
  zipPath: string,
  targetDir: string
): Promise<string[]> {
  const extractedFiles: string[] = [];
  const zipBuffer = await fs.readFile(zipPath);
  const zip = await JSZip.loadAsync(zipBuffer);

  // Process zip entries
  const zipEntries = Object.keys(zip.files);

  for (const entryPath of zipEntries) {
    const entry = zip.files[entryPath];

    // Skip directories
    if (entry.dir) continue;

    // Security check to prevent directory traversal
    if (entryPath.includes("..")) {
      throw new Error(`Invalid path in zip: ${entryPath}`);
    }

    // Get file buffer
    const content = await entry.async("nodebuffer");

    // Create directory structure if needed
    const filePath = path.join(targetDir, entryPath);
    const fileDir = path.dirname(filePath);

    if (!fsSync.existsSync(fileDir)) {
      await fs.mkdir(fileDir, { recursive: true });
    }

    // Write file
    await fs.writeFile(filePath, content);
    extractedFiles.push(entryPath);
  }

  return extractedFiles;
}

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
