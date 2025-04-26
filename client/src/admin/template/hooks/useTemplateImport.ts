import { useState, useRef } from "react";
import { Logger } from "shared/logger";
import { StoryTemplate } from "core/types";
import JSZip from "jszip";
import { API_CONFIG } from "core/config";
import {
  ImportDialogState,
  CollectionImportDialogState,
  TemplateImportInfo,
  TemplateProcessing,
  TemplateCore,
  ImportSummary,
} from "../types/templateTypes";
import {
  importTemplateZip,
  createTemplateAssetsZip,
  createAssetZipFromFiles,
} from "../utils/zipTemplateUtils";

export const useTemplateImport = (
  token: string,
  templateProcessing: TemplateProcessing,
  templateCore: TemplateCore
) => {
  // Refs for file inputs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const collectionFileInputRef = useRef<HTMLInputElement>(null);

  // Import dialog states
  const [importDialog, setImportDialog] = useState<ImportDialogState>({
    isOpen: false,
    file: null,
    existingTemplate: null,
    newTemplate: null,
    isNewer: false,
  });

  const [collectionImportDialog, setCollectionImportDialog] =
    useState<CollectionImportDialogState>({
      isOpen: false,
      file: null,
      summary: { total: 0, new: 0, newer: 0, older: 0, same: 0 },
      templates: [],
    });

  /**
   * Import a template from a collection
   */
  const importTemplateFromCollection = async (
    templateData: Partial<StoryTemplate>,
    templateDir: string,
    zipData: JSZip,
    zipFiles: string[]
  ): Promise<void> => {
    try {
      // Create template on server
      const createdTemplate = await templateCore.createTemplate(templateData);

      // Create assets zip for this template
      const { zipBlob, fileCount } = await createTemplateAssetsZip(
        templateDir,
        zipData,
        zipFiles
      );

      // Import assets if there are any
      if (fileCount > 0) {
        await importTemplateZip(
          token,
          createdTemplate.id,
          zipBlob,
          API_CONFIG.DEFAULT_API_URL
        );
      }

      Logger.Admin.log(`Imported template: ${createdTemplate.title}`);
    } catch (error) {
      Logger.Admin.error(
        `Error importing template from ${templateDir || "root"}`,
        error
      );
      throw error;
    }
  };

  /**
   * Import a template with optional assets
   */
  const importTemplate = async (
    templateData: Partial<StoryTemplate>,
    assetFiles?: string[],
    zipData?: JSZip,
    templateDir: string = ""
  ) => {
    // Create template on server
    const createdTemplate = await templateCore.createTemplate(templateData);

    // Upload asset files if provided
    if (assetFiles && assetFiles.length > 0 && zipData) {
      Logger.Admin.log(`Uploading ${assetFiles.length} asset files`);

      // Create and upload the asset zip
      const zipBlob = await createAssetZipFromFiles(
        assetFiles,
        zipData,
        templateDir
      );
      await importTemplateZip(
        token,
        createdTemplate.id,
        zipBlob,
        API_CONFIG.DEFAULT_API_URL
      );
    }

    return createdTemplate;
  };

  /**
   * Calculate summary statistics for template imports
   */
  const calculateImportSummary = (
    templates: TemplateImportInfo[]
  ): ImportSummary => {
    return {
      total: templates.length,
      new: templates.filter((info) => !info.existingTemplate).length,
      newer: templates.filter((info) => info.existingTemplate && info.isNewer)
        .length,
      older: templates.filter(
        (info) => info.existingTemplate && !info.isNewer && !info.isSameAge
      ).length,
      same: templates.filter((info) => info.existingTemplate && info.isSameAge)
        .length,
    };
  };

  /**
   * Process a single template file for import
   */
  const processTemplateImport = async (file: File) => {
    if (!file) return;

    Logger.Admin.log(`Processing template from file: ${file.name}`);
    templateCore.setIsLoading(true);
    templateCore.setError(null);

    try {
      // Process the file to extract template data and assets
      const { templateData, assetFiles, zipData, templateDir } =
        await templateProcessing.processTemplateFile(file);

      Logger.Admin.log(`Found template: ${templateData.title}`);

      // Check if template already exists
      const existingTemplate =
        templateProcessing.findExistingTemplate(templateData);

      if (existingTemplate) {
        // Open confirmation dialog
        setImportDialog({
          isOpen: true,
          file,
          existingTemplate,
          newTemplate: templateData,
          isNewer: templateProcessing.compareTemplateVersions(
            existingTemplate,
            templateData
          ),
        });
        templateCore.setIsLoading(false);
        return;
      }

      // No existing template, proceed with import
      await importTemplate(templateData, assetFiles, zipData, templateDir);

      // Refresh templates list
      await templateCore.loadTemplates();
    } catch (error) {
      Logger.Admin.error("Failed to import template", error);
      templateCore.setError(
        "Failed to import template. Please check the file format."
      );
    } finally {
      templateCore.setIsLoading(false);
    }
  };

  /**
   * Confirm import of a single template after user approval
   */
  const confirmTemplateImport = async () => {
    if (!importDialog.file || !importDialog.newTemplate) return;

    templateCore.setIsLoading(true);
    try {
      if (importDialog.file.name.endsWith(".zip")) {
        // Re-process the ZIP to get assets
        const { assetFiles, zipData, templateDir } =
          await templateProcessing.processTemplateFile(importDialog.file);

        // Import template with assets
        await importTemplate(
          importDialog.newTemplate,
          assetFiles,
          zipData,
          templateDir
        );
      } else {
        // Just import the template data
        await importTemplate(importDialog.newTemplate);
      }

      // Close dialog
      closeImportDialog();

      // Refresh templates list
      await templateCore.loadTemplates();
    } catch (error) {
      Logger.Admin.error("Failed to import template after confirmation", error);
      templateCore.setError("Failed to import template. Please try again.");
    } finally {
      templateCore.setIsLoading(false);
    }
  };

  /**
   * Process a template collection file for import
   */
  const processTemplateCollectionImport = async (file: File) => {
    if (!file) return;

    Logger.Admin.log(`Processing template collection from file: ${file.name}`);
    templateCore.setIsLoading(true);
    templateCore.setError(null);

    try {
      // Process the collection file
      const { templates: templateInfos } =
        await templateProcessing.processCollectionFile(file);

      // Calculate summary
      const summary = calculateImportSummary(templateInfos);

      // Show confirmation dialog
      setCollectionImportDialog({
        isOpen: true,
        file,
        summary,
        templates: templateInfos,
      });
    } catch (error) {
      Logger.Admin.error("Failed to import template collection", error);
      templateCore.setError(
        "Failed to import template collection. Please check the file format."
      );
    } finally {
      templateCore.setIsLoading(false);
    }
  };

  /**
   * Confirm import of a template collection after user approval
   */
  const confirmCollectionImport = async () => {
    if (
      !collectionImportDialog.file ||
      collectionImportDialog.templates.length === 0
    )
      return;

    templateCore.setIsLoading(true);
    try {
      if (collectionImportDialog.file.name.endsWith(".zip")) {
        // Re-process the ZIP to import templates with assets
        const {
          templates: templateInfos,
          zipData,
          zipFiles,
        } = await templateProcessing.processCollectionFile(
          collectionImportDialog.file
        );

        // Import each template from the dialog
        for (const templateInfo of templateInfos) {
          const templateDir = templateInfo.templateDir;

          try {
            // Import this template with all its assets from its directory
            await importTemplateFromCollection(
              templateInfo.template,
              templateDir,
              zipData!,
              zipFiles!
            );
          } catch (importError) {
            Logger.Admin.error(
              `Error importing template from ${templateDir}`,
              importError
            );
            // Continue with other templates even if one fails
          }
        }
      } else {
        // JSON array import
        for (const templateInfo of collectionImportDialog.templates) {
          try {
            // Create template on server
            await templateCore.createTemplate(templateInfo.template);
          } catch (error) {
            Logger.Admin.error("Failed to import a template", error);
            // Continue with other templates
          }
        }
      }

      // Close dialog
      closeCollectionImportDialog();

      // Refresh templates list
      await templateCore.loadTemplates();
    } catch (error) {
      Logger.Admin.error(
        "Failed to import template collection after confirmation",
        error
      );
      templateCore.setError(
        "Failed to import template collection. Please try again."
      );
    } finally {
      templateCore.setIsLoading(false);
    }
  };

  // Dialog management functions
  const closeImportDialog = () => {
    setImportDialog({
      isOpen: false,
      file: null,
      existingTemplate: null,
      newTemplate: null,
      isNewer: false,
    });
  };

  const closeCollectionImportDialog = () => {
    setCollectionImportDialog({
      isOpen: false,
      file: null,
      summary: { total: 0, new: 0, newer: 0, older: 0, same: 0 },
      templates: [],
    });
  };

  // Public handler functions
  const handleImportTemplate = (file: File) => {
    if (!file) return;
    Logger.Admin.log(`Importing template from file: ${file.name}`);
    processTemplateImport(file);
  };

  const handleImportTemplateCollection = (file: File) => {
    if (!file) return;
    Logger.Admin.log(`Importing template collection from file: ${file.name}`);
    processTemplateCollectionImport(file);
  };

  const handleFileInputChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (file) {
      Logger.Admin.log(
        `Selected file: ${file.name} (${file.type}), size: ${file.size} bytes`
      );
      handleImportTemplate(file);

      // Reset the file input so the same file can be selected again
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleCollectionFileInputChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (file) {
      Logger.Admin.log(
        `Selected collection file: ${file.name} (${file.type}), size: ${file.size} bytes`
      );
      handleImportTemplateCollection(file);

      // Reset the file input so the same file can be selected again
      if (collectionFileInputRef.current) {
        collectionFileInputRef.current.value = "";
      }
    }
  };

  return {
    // Refs
    fileInputRef,
    collectionFileInputRef,

    // Dialog states
    importDialog,
    collectionImportDialog,

    // Dialog actions
    confirmTemplateImport,
    closeImportDialog,
    confirmCollectionImport,
    closeCollectionImportDialog,

    // File input handlers
    handleFileInputChange,
    handleCollectionFileInputChange,

    // Direct import methods (for programmatic use)
    handleImportTemplate,
    handleImportTemplateCollection,
  };
};
