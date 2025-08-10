import path from "path";
import fs from "fs/promises";
import fsSync from "fs";
import os from "os";
import { extractZip, copyDirectoryContents } from "shared/storageUtils.js";
import { Logger } from "shared/logger.js";

const logger = Logger.forService("TemplateZipUtils");

export interface TemplateExtractionResult {
  templateId: string;
  sourceDir: string;
  tempExtractDir: string;
  tempZipPath: string;
}

/**
 * Extracts a zip file and analyzes its structure to find template ID and source directory
 * @param zipBuffer - Buffer containing the zip file data
 * @returns Object containing template ID, source directory, and temp paths for cleanup
 */
export async function extractAndAnalyzeTemplateZip(
  zipBuffer: Buffer
): Promise<TemplateExtractionResult> {
  // Create temporary file for the zip
  const tempZipPath = path.join(
    os.tmpdir(),
    `template-import-${Date.now()}.zip`
  );
  await fs.writeFile(tempZipPath, zipBuffer);

  // Create temporary extraction directory
  const tempExtractDir = path.join(
    os.tmpdir(),
    `template-extract-${Date.now()}`
  );
  await fs.mkdir(tempExtractDir, { recursive: true });

  // Extract the zip to inspect its structure
  await extractZip(tempZipPath, tempExtractDir);

  // Find template ID and source directory
  const { templateId, sourceDir } = await findTemplateIdAndSource(
    tempExtractDir
  );

  if (!templateId) {
    throw new Error("Could not extract template ID from zip file structure");
  }

  return {
    templateId,
    sourceDir,
    tempExtractDir,
    tempZipPath,
  };
}

/**
 * Analyzes the extracted zip structure to find template ID and determine source directory
 * @param extractDir - Directory where zip was extracted
 * @returns Object containing template ID and source directory path
 */
async function findTemplateIdAndSource(
  extractDir: string
): Promise<{ templateId: string | null; sourceDir: string }> {
  let templateId: string | null = null;
  let sourceDir: string = extractDir;

  // Check for template.json file at root level
  const rootTemplateJsonPath = path.join(extractDir, "template.json");
  if (fsSync.existsSync(rootTemplateJsonPath)) {
    try {
      const templateData = JSON.parse(
        await fs.readFile(rootTemplateJsonPath, "utf-8")
      );
      templateId = templateData.id;
      sourceDir = extractDir; // Files are at root level
      logger.log(`Found template.json at root level with ID: ${templateId}`);
      return { templateId, sourceDir };
    } catch {
      logger.warn(
        "Failed to parse template.json at root level, checking subdirectories"
      );
    }
  }

  // If no template.json at root, look for directory structure
  const items = await fs.readdir(extractDir);
  const directories = items.filter((item) => {
    const itemPath = path.join(extractDir, item);
    return fsSync.statSync(itemPath).isDirectory();
  });

  // Check each directory for template.json
  for (const dir of directories) {
    const dirTemplateJsonPath = path.join(extractDir, dir, "template.json");
    if (fsSync.existsSync(dirTemplateJsonPath)) {
      try {
        const templateData = JSON.parse(
          await fs.readFile(dirTemplateJsonPath, "utf-8")
        );
        templateId = templateData.id;
        sourceDir = path.join(extractDir, dir); // Files are in subdirectory
        logger.log(
          `Found template.json in subdirectory '${dir}' with ID: ${templateId}`
        );
        return { templateId, sourceDir };
      } catch {
        logger.warn(`Failed to parse template.json in directory ${dir}`);
      }
    }
  }

  // If still no template.json found, try using directory name as template ID
  if (!templateId && directories.length === 1) {
    templateId = directories[0];
    sourceDir = path.join(extractDir, directories[0]);
    logger.log(`Using directory name as template ID: ${templateId}`);
  } else if (!templateId && directories.length > 1) {
    // Look for a directory that looks like a UUID
    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const uuidDir = directories.find((dir) => uuidPattern.test(dir));
    if (uuidDir) {
      templateId = uuidDir;
      sourceDir = path.join(extractDir, uuidDir);
      logger.log(`Using UUID directory name as template ID: ${templateId}`);
    }
  }

  return { templateId, sourceDir };
}

/**
 * Copies template files from extracted zip to template storage directory
 * @param sourceDir - Source directory containing template files
 * @param templateDir - Target template directory
 * @returns Array of copied file paths
 */
export async function copyTemplateFiles(
  sourceDir: string,
  templateDir: string
): Promise<string[]> {
  // Ensure the template directory exists
  if (!fsSync.existsSync(templateDir)) {
    await fs.mkdir(templateDir, { recursive: true });
  }

  // Copy files from source directory to template directory
  const copiedFiles = await copyDirectoryContents(sourceDir, templateDir);

  logger.log(`Copied ${copiedFiles.length} files to template directory`);
  return copiedFiles;
}

/**
 * Cleans up temporary files and directories created during template import
 * @param tempZipPath - Path to temporary zip file
 * @param tempExtractDir - Path to temporary extraction directory
 */
export async function cleanupTempFiles(
  tempZipPath: string,
  tempExtractDir: string
): Promise<void> {
  try {
    // Clean up temporary zip file
    if (fsSync.existsSync(tempZipPath)) {
      await fs.unlink(tempZipPath);
    }

    // Clean up temporary extraction directory
    if (fsSync.existsSync(tempExtractDir)) {
      await fs.rmdir(tempExtractDir, { recursive: true });
    }

    logger.log("Cleaned up temporary files");
  } catch (error) {
    logger.warn("Failed to clean up some temporary files", error);
    // Don't throw - cleanup failures shouldn't break the import
  }
}
