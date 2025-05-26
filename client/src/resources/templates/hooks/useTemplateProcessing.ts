import { StoryTemplate } from "core/types";
import { Logger } from "shared/logger";
import JSZip from "jszip";
import {
  findTemplateJsonInZip,
  parseTemplateFromZip,
} from "core/utils/zipUtils.js";
import { TemplateImportInfo } from "../templateTypes";
import {
  loadZipFile,
  processJsonTemplateFile,
} from "../utils/zipTemplateUtils";

export const useTemplateProcessing = (templates: StoryTemplate[]) => {
  // Compare template versions and determine if imported one is newer
  const compareTemplateVersions = (
    existingTemplate: StoryTemplate,
    newTemplate: Partial<StoryTemplate>
  ): boolean => {
    // If new template has an updatedAt field, compare dates
    if (newTemplate.updatedAt && existingTemplate.updatedAt) {
      return (
        new Date(newTemplate.updatedAt) > new Date(existingTemplate.updatedAt)
      );
    }

    // If no updatedAt on new template, it's not considered newer
    return false;
  };

  // Check if templates have the same timestamp
  const isSameTemplateVersion = (
    existingTemplate: StoryTemplate,
    newTemplate: Partial<StoryTemplate>
  ): boolean => {
    if (newTemplate.updatedAt && existingTemplate.updatedAt) {
      return (
        new Date(newTemplate.updatedAt).getTime() ===
        new Date(existingTemplate.updatedAt).getTime()
      );
    }
    return false;
  };

  // Find an existing template by title or ID
  const findExistingTemplate = (
    templateData: Partial<StoryTemplate>
  ): StoryTemplate | null => {
    // First try to find by ID if it exists
    if (templateData.id) {
      const foundById = templates.find((t) => t.id === templateData.id);
      if (foundById) return foundById;
    }

    // Then try to find by title
    if (templateData.title) {
      const foundByTitle = templates.find(
        (t) => t.title.toLowerCase() === templateData.title?.toLowerCase()
      );
      if (foundByTitle) return foundByTitle;
    }

    return null;
  };

  // Process a template file (JSON or ZIP) and extract template data
  const processTemplateFile = async (
    file: File
  ): Promise<{
    templateData: Partial<StoryTemplate>;
    assetFiles?: string[];
    zipData?: JSZip;
    templateDir?: string;
  }> => {
    Logger.Admin.log(`Processing template file: ${file.name}`);

    if (file.name.endsWith(".zip")) {
      try {
        // Handle ZIP file import
        const zipData = await loadZipFile(file);
        const zipFiles = Object.keys(zipData.files);
        Logger.Admin.log(`ZIP contains ${zipFiles.length} files/directories`);

        // Find template.json and asset files
        const { templateFile, templateDir, assetFiles } =
          await findTemplateJsonInZip(zipFiles, zipData);

        // Parse template data
        const templateData = await parseTemplateFromZip(templateFile);
        Logger.Admin.log(`Found template: ${templateData.title}`);

        return { templateData, assetFiles, zipData, templateDir };
      } catch (zipError: Error | unknown) {
        Logger.Admin.error("ZIP processing error:", zipError);
        const errorMessage =
          zipError instanceof Error ? zipError.message : String(zipError);
        throw new Error(`ZIP processing error: ${errorMessage}`);
      }
    }

    // Handle JSON file
    try {
      const templateData = await processJsonTemplateFile(file);
      return { templateData };
    } catch (error) {
      Logger.Admin.error("Failed to process JSON template", error);
      throw new Error("Failed to process JSON template");
    }
  };

  // Process a collection file (JSON array or ZIP with multiple templates)
  const processCollectionFile = async (
    file: File
  ): Promise<{
    templates: TemplateImportInfo[];
    zipData?: JSZip;
    zipFiles?: string[];
  }> => {
    Logger.Admin.log(`Processing template collection: ${file.name}`);

    if (file.name.endsWith(".zip")) {
      try {
        const zipData = await loadZipFile(file);
        const zipFiles = Object.keys(zipData.files);

        // Find all directories at the root level that contain template.json files
        // This matches the export structure: [templateId]/template.json
        const rootDirs = new Set<string>();

        // First collect all directories at root level
        zipFiles
          .filter(
            (path) =>
              path.includes("/") &&
              !path.substring(path.indexOf("/") + 1).includes("/")
          )
          .forEach((path) => {
            const dir = path.substring(0, path.indexOf("/"));
            if (dir) rootDirs.add(dir);
          });

        // Also include directories that have deeper structure
        zipFiles
          .filter((path) => path.includes("/"))
          .forEach((path) => {
            const dir = path.substring(0, path.indexOf("/"));
            if (dir) rootDirs.add(dir);
          });

        Logger.Admin.log(`Found ${rootDirs.size} top-level directories in ZIP`);

        // Filter to only include directories that contain template.json
        const templateDirs = Array.from(rootDirs).filter((dir) =>
          zipFiles.includes(`${dir}/template.json`)
        );

        if (templateDirs.length === 0) {
          throw new Error(
            "No template.json files found in the expected structure. Each template should be in its own directory at the root level."
          );
        }

        Logger.Admin.log(
          `Found ${templateDirs.length} template directories in the ZIP file`
        );

        // Process each template to prepare for confirmation
        const templateInfos: TemplateImportInfo[] = [];

        for (const templateDir of templateDirs) {
          try {
            // Find and read template.json
            const templateJsonPath = `${templateDir}/template.json`;
            const templateFile = zipData.files[templateJsonPath];

            if (!templateFile) {
              Logger.Admin.warn(
                `No template.json found in ${templateDir}, skipping`
              );
              continue;
            }

            // Parse template data
            const templateData = await parseTemplateFromZip(templateFile);

            // Check if template already exists
            const existingTemplate = findExistingTemplate(templateData);
            const isNewer = existingTemplate
              ? compareTemplateVersions(existingTemplate, templateData)
              : false;

            // Check if same age (same updatedAt timestamp)
            const isSameAge = existingTemplate
              ? isSameTemplateVersion(existingTemplate, templateData)
              : false;

            templateInfos.push({
              template: templateData,
              existingTemplate,
              isNewer,
              templateDir,
              isSameAge,
            });
          } catch (importError) {
            Logger.Admin.error(
              `Error processing template from ${templateDir}`,
              importError
            );
            // Continue with other templates even if one fails
          }
        }

        return { templates: templateInfos, zipData, zipFiles };
      } catch (zipError: Error | unknown) {
        Logger.Admin.error("ZIP processing error:", zipError);
        const errorMessage =
          zipError instanceof Error ? zipError.message : String(zipError);
        throw new Error(`ZIP processing error: ${errorMessage}`);
      }
    }

    // Handle JSON array file
    try {
      const templateData = await processJsonTemplateFile(file);

      // Check if the JSON data is an array of templates
      if (!Array.isArray(templateData)) {
        throw new Error(
          "The file does not contain a valid template collection (expected an array)"
        );
      }

      // Process each template in the array
      const templateInfos: TemplateImportInfo[] = [];
      for (const template of templateData) {
        // Validate that it's a template object
        if (!template || typeof template !== "object" || !template.title) {
          Logger.Admin.warn(
            "Invalid template in collection, skipping:",
            template
          );
          continue;
        }

        // Check if template already exists
        const existingTemplate = findExistingTemplate(template);
        const isNewer = existingTemplate
          ? compareTemplateVersions(existingTemplate, template)
          : false;

        // Check if same age
        const isSameAge = existingTemplate
          ? isSameTemplateVersion(existingTemplate, template)
          : false;

        templateInfos.push({
          template,
          existingTemplate,
          isNewer,
          isSameAge,
          templateDir: "",
        });
      }

      return { templates: templateInfos };
    } catch (error) {
      Logger.Admin.error("Failed to process JSON template collection", error);
      throw new Error("Failed to process JSON template collection");
    }
  };

  return {
    compareTemplateVersions,
    processTemplateFile,
    processCollectionFile,
    findExistingTemplate,
  };
};
