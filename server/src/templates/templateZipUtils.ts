import path from "path";
import fs from "fs/promises";
import fsSync from "fs";
import os from "os";
import { StoryTemplate } from "core/types/index.js";
import { extractZip, copyDirectoryContents } from "shared/storageUtils.js";
import { Logger } from "shared/logger.js";

const logger = Logger.forService("TemplateZipUtils");

export interface TemplateExtractionResult {
  /** The World id the zip names, as it names it: check it before any use */
  templateId: unknown;
  /** The zip's template.json, or null when the id comes from a folder name */
  template: Partial<StoryTemplate> | null;
  sourceDir: string;
  tempExtractDir: string;
  tempZipPath: string;
}

interface TemplateIdAndSource {
  templateId: unknown;
  template: Partial<StoryTemplate> | null;
  sourceDir: string;
}

/**
 * Extracts a zip file into a temporary folder of its own and analyzes its
 * structure to find template ID and source directory. On failure it removes
 * the temporary files before throwing.
 * @param zipBuffer - Buffer containing the zip file data
 * @returns Object containing template ID, source directory, and temp paths for cleanup
 */
export async function extractAndAnalyzeTemplateZip(
  zipBuffer: Buffer
): Promise<TemplateExtractionResult> {
  // A folder no other import shares, and the zip file beside it
  const tempExtractDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "template-extract-")
  );
  const tempZipPath = `${tempExtractDir}.zip`;

  try {
    await fs.writeFile(tempZipPath, zipBuffer);

    // Extract the zip to inspect its structure
    await extractZip(tempZipPath, tempExtractDir);

    // Find template ID and source directory
    const { templateId, template, sourceDir } = await findTemplateIdAndSource(
      tempExtractDir
    );

    if (!templateId) {
      throw new Error("Could not extract template ID from zip file structure");
    }

    return {
      templateId,
      template,
      sourceDir,
      tempExtractDir,
      tempZipPath,
    };
  } catch (error) {
    await cleanupTempFiles(tempZipPath, tempExtractDir);
    throw error;
  }
}

/** A template.json's template; throws if the file doesn't hold a JSON object */
async function readTemplateJson(
  filePath: string
): Promise<Partial<StoryTemplate>> {
  const parsed: unknown = JSON.parse(await fs.readFile(filePath, "utf-8"));
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("template.json holds no template");
  }
  return parsed as Partial<StoryTemplate>;
}

/**
 * Analyzes the extracted zip structure to find template ID and determine source directory
 * @param extractDir - Directory where zip was extracted
 * @returns Object containing template ID, the template.json it came from, and source directory path
 */
async function findTemplateIdAndSource(
  extractDir: string
): Promise<TemplateIdAndSource> {
  let templateId: unknown = null;
  let sourceDir: string = extractDir;

  // Check for template.json file at root level
  const rootTemplateJsonPath = path.join(extractDir, "template.json");
  if (fsSync.existsSync(rootTemplateJsonPath)) {
    try {
      const template = await readTemplateJson(rootTemplateJsonPath);
      templateId = template.id;
      sourceDir = extractDir; // Files are at root level
      logger.log(`Found template.json at root level with ID: ${templateId}`);
      return { templateId, template, sourceDir };
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
        const template = await readTemplateJson(dirTemplateJsonPath);
        templateId = template.id;
        sourceDir = path.join(extractDir, dir); // Files are in subdirectory
        logger.log(
          `Found template.json in subdirectory '${dir}' with ID: ${templateId}`
        );
        return { templateId, template, sourceDir };
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

  return { templateId, template: null, sourceDir };
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
    await fs.rm(tempExtractDir, { recursive: true, force: true });

    logger.log("Cleaned up temporary files");
  } catch (error) {
    logger.warn("Failed to clean up some temporary files", error);
    // Don't throw - cleanup failures shouldn't break the import
  }
}
