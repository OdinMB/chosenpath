import { StoryTemplate } from "../types/story.js";

/**
 * Template ZIP utility functions shared between client and server
 * These utilities work with both Node.js and browser environments when possible
 */

// Common types
export interface ZipFile {
  name: string;
  path: string;
  data: Blob | Buffer | ArrayBuffer;
}

/**
 * Finds the template.json file in a ZIP archive
 * @param zipFiles - List of file paths in the ZIP
 * @param zipData - The JSZip instance with loaded files
 * @returns Object with templateFile (the JSZip file object) and templateDir (the directory containing template.json)
 */
export const findTemplateJsonInZip = async (
  zipFiles: string[],
  zipData: any
): Promise<{
  templateFile: any;
  templateDir: string;
  assetFiles: string[];
}> => {
  // First check for template.json at root level
  const rootTemplateJson = zipData.files["template.json"];
  let templateFile = rootTemplateJson;
  let templateDir = "";

  // If not at root, try to find it in a subdirectory
  if (!rootTemplateJson) {
    // Find directories in the ZIP
    const dirEntries = zipFiles
      .filter((path) => path.endsWith("/"))
      .map((path) => path.slice(0, -1)); // Remove trailing slash

    if (dirEntries.length === 0) {
      throw new Error(
        "No directories found in ZIP and no template.json at root"
      );
    }

    // Try each directory for template.json
    for (const dir of dirEntries) {
      const jsonPath = `${dir}/template.json`;
      if (zipData.files[jsonPath]) {
        templateDir = dir;
        templateFile = zipData.files[jsonPath];
        break;
      }
    }
  }

  if (!templateFile) {
    throw new Error("No template.json found in the ZIP file");
  }

  // Get the asset files
  const assetFiles = zipFiles.filter((path) => {
    // Skip directories and template.json
    if (
      path.endsWith("/") ||
      path === "template.json" ||
      path === `${templateDir}/template.json`
    ) {
      return false;
    }

    // If we found template.json in a directory, only include files from that directory
    if (templateDir && !path.startsWith(`${templateDir}/`)) {
      return false;
    }

    return true;
  });

  return { templateFile, templateDir, assetFiles };
};

/**
 * Parse template data from a template file in a ZIP
 * @param templateFile - The JSZip file object for template.json
 * @returns The parsed template data
 */
export const parseTemplateFromZip = async (
  templateFile: any
): Promise<Partial<StoryTemplate>> => {
  const templateContent = await templateFile.async("text");
  return JSON.parse(templateContent);
};

/**
 * Extract asset files from a ZIP for a template
 * @param zipData - The JSZip instance with loaded files
 * @param templateDir - The directory containing the template.json file
 * @returns Array of file objects to upload
 */
export const extractAssetFilesFromZip = async (
  zipData: any,
  templateDir: string
): Promise<Array<{ path: string; blob: Blob; fileName: string }>> => {
  const zipFiles = Object.keys(zipData.files);
  const assetFiles: Array<{ path: string; blob: Blob; fileName: string }> = [];

  // Get all files that are not directories and not template.json
  for (const path of zipFiles) {
    if (
      !path.endsWith("/") &&
      path !== "template.json" &&
      path !== `${templateDir}/template.json`
    ) {
      // If we found template.json in a directory, only include files from that directory
      if (templateDir && !path.startsWith(`${templateDir}/`)) {
        continue;
      }

      const fileData = await zipData.files[path].async("blob");
      const fileName = path.split("/").pop() || "";
      assetFiles.push({ path, blob: fileData, fileName });
    }
  }

  return assetFiles;
};

/**
 * Validates if a template.json object contains required fields
 * @param template - The template object to validate
 * @returns Whether the template is valid
 */
export const validateTemplate = (template: any): boolean => {
  // Verify essential properties exist
  const requiredProps = [
    "title",
    "teaser",
    "storyElements",
    "sharedOutcomes",
    "playerCountMin",
    "playerCountMax",
    "maxTurnsMin",
    "maxTurnsMax",
  ];

  for (const prop of requiredProps) {
    if (!(prop in template)) {
      return false;
    }
  }

  return true;
};

/**
 * Creates a ZIP of collection directories (available in both client and server)
 * @param templates - Array of template objects
 * @param zip - The JSZip instance to add files to
 */
export const createTemplateCollectionZip = async (
  templates: StoryTemplate[],
  zip: any
): Promise<void> => {
  // Add each template as JSON
  templates.forEach((template) => {
    const templateJson = JSON.stringify(template, null, 2);
    const templateDir = `templates/${template.id}`;
    zip.file(`${templateDir}/template.json`, templateJson);
  });
};
