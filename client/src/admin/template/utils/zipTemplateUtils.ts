import JSZip from "jszip";
import { StoryTemplate } from "core/types";
import { Logger } from "shared/logger";

/**
 * Import a ZIP file directly to a template (client-side)
 * @param token - Auth token
 * @param templateId - ID of the template
 * @param zipData - The ZIP file blob to upload
 * @param apiUrl - API URL (optional)
 */
export const importTemplateZip = async (
  token: string,
  templateId: string,
  zipData: Blob,
  apiUrl: string
): Promise<{ filesImported: number; files: string[] }> => {
  const formData = new FormData();
  formData.append("zip", zipData, "template-assets.zip");

  const url = `${apiUrl}/admin/templates/${templateId}/import?requestId=${crypto.randomUUID()}`;

  Logger.Admin.log(`Importing ZIP file to template ${templateId}`);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to import ZIP file to template: ${response.statusText}. ${errorText}`
    );
  }

  const result = await response.json();
  Logger.Admin.log(
    `Successfully imported ${result.data.filesImported} files to template ${templateId}`
  );

  return {
    filesImported: result.data.filesImported,
    files: result.data.files || [],
  };
};

/**
 * Create a ZIP with files from a specific template directory
 */
export const createTemplateAssetsZip = async (
  templateDir: string,
  zipData: JSZip,
  zipFiles: string[]
): Promise<{ zipBlob: Blob; fileCount: number }> => {
  // Find all files in this template directory
  const templateFiles = zipFiles.filter((path) => {
    // Skip directories and template.json itself
    if (
      path.endsWith("/") ||
      path === "template.json" ||
      (templateDir && path === `${templateDir}/template.json`)
    ) {
      return false;
    }

    // If we have a template directory, only include files from that directory
    if (templateDir && !path.startsWith(`${templateDir}/`)) {
      return false;
    }

    // If we're at root (templateDir is empty), only include root files, not subdirectories
    if (templateDir === "" && path.includes("/")) {
      return false;
    }

    return true;
  });

  if (templateFiles.length === 0) {
    return { zipBlob: new Blob(), fileCount: 0 };
  }

  // Generate a new zip with just the template files
  const templateZip = new JSZip();

  // Add files to the zip with proper relative paths
  for (const filePath of templateFiles) {
    // Get the relative path from the template directory
    let relativePath = filePath;
    if (templateDir && filePath.startsWith(`${templateDir}/`)) {
      relativePath = filePath.substring(templateDir.length + 1);
    }

    // Get the file content
    const fileData = await zipData.files[filePath].async("blob");

    // Add file to zip with proper path
    templateZip.file(relativePath, fileData);
  }

  // Generate zip blob
  const zipBlob = await templateZip.generateAsync({ type: "blob" });
  return { zipBlob, fileCount: templateFiles.length };
};

/**
 * Creates a ZIP with asset files for a template
 */
export const createAssetZipFromFiles = async (
  assetFiles: string[],
  zipData: JSZip,
  templateDir: string = ""
): Promise<Blob> => {
  const assetZip = new JSZip();

  // Add all files to the zip with correct paths
  for (const filePath of assetFiles) {
    // Get the relative path from template directory
    let relativePath = filePath;
    if (templateDir && filePath.startsWith(`${templateDir}/`)) {
      relativePath = filePath.substring(templateDir.length + 1);
    }

    // Get the file content
    const fileData = await zipData.files[filePath].async("blob");

    // Add to the new zip
    assetZip.file(relativePath, fileData);
  }

  // Generate the ZIP blob
  return assetZip.generateAsync({ type: "blob" });
};

/**
 * Process a JSON file to extract template data
 */
export const processJsonTemplateFile = (
  file: File
): Promise<Partial<StoryTemplate>> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const templateData = JSON.parse(content);
        resolve(templateData);
      } catch (error) {
        Logger.Admin.error("Failed to parse JSON template", error);
        reject(new Error("Failed to parse JSON template"));
      }
    };

    reader.onerror = () => {
      Logger.Admin.error("Error reading file");
      reject(new Error("Failed to read file"));
    };

    reader.readAsText(file);
  });
};

/**
 * Load and prepare a ZIP file for processing
 */
export const loadZipFile = async (file: File): Promise<JSZip> => {
  const zip = new JSZip();
  return await zip.loadAsync(file);
};
