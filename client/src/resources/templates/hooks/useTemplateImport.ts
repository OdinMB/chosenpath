import { useState, useRef } from "react";
import { Logger } from "shared/logger";
import { StoryTemplate } from "core/types";
import JSZip from "jszip";
import { notificationService } from "shared/notifications/notificationService";
import {
  ImportDialogState,
  CollectionImportDialogState,
  TemplateImportInfo,
  TemplateProcessing,
  TemplateCore,
  ImportSummary,
} from "../templateTypes";
import {
  createTemplateAssetsZip,
  createAssetZipFromFiles,
} from "../utils/zipTemplateUtils";
import { templateApi } from "../templateApi";

export const useTemplateImport = (
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
      if (fileCount > 0 && zipBlob.size > 0) {
        const importResult = await templateApi.importTemplateZip(
          createdTemplate.id,
          zipBlob
        );
        Logger.Admin.log(
          `Imported ${importResult.filesImported} files for template: ${createdTemplate.title}`
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

      // Only import if we have a valid zip with content
      if (zipBlob.size > 0) {
        const importResult = await templateApi.importTemplateZip(
          createdTemplate.id,
          zipBlob
        );
        Logger.Admin.log(
          `Imported ${importResult.filesImported} files for template: ${createdTemplate.title}`
        );
      }
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
      templateCore.revalidator.revalidate();
    } catch (error) {
      Logger.Admin.error("Failed to import template", error);
      notificationService.addErrorNotification(
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
      templateCore.revalidator.revalidate();
    } catch (error) {
      Logger.Admin.error("Failed to import template", error);
      notificationService.addErrorNotification(
        "Failed to import template. Please try again."
      );
    } finally {
      templateCore.setIsLoading(false);
      closeImportDialog();
    }
  };

  /**
   * Process a template collection file for import
   */
  const processTemplateCollectionImport = async (file: File) => {
    if (!file) return;

    Logger.Admin.log(`Processing template collection from file: ${file.name}`);
    templateCore.setIsLoading(true);

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
      Logger.Admin.error("Failed to process template collection", error);
      notificationService.addErrorNotification(
        "Failed to process template collection. Please check the file format."
      );
    } finally {
      templateCore.setIsLoading(false);
    }
  };

  /**
   * Confirm import of a template collection after user approval
   */
  const confirmCollectionImport = async () => {
    if (!collectionImportDialog.file || !collectionImportDialog.templates)
      return;

    templateCore.setIsLoading(true);
    let importedCount = 0;
    const totalToImport = collectionImportDialog.templates.filter(
      (t) => !t.existingTemplate || t.isNewer
    ).length;

    try {
      if (collectionImportDialog.file.name.endsWith(".zip")) {
        // Re-process the ZIP to get asset handling data (zipData, zipFiles)
        // but decisions will be based on collectionImportDialog.templates
        const {
          // templates from processCollectionFile is not used for decision logic here
          zipData,
          zipFiles,
        } = await templateProcessing.processCollectionFile(
          collectionImportDialog.file
        );

        // Iterate over the templates the user saw and confirmed in the dialog
        for (const dialogTemplateInfo of collectionImportDialog.templates) {
          // Only import if it's new or newer
          if (
            !dialogTemplateInfo.existingTemplate ||
            dialogTemplateInfo.isNewer
          ) {
            try {
              await importTemplateFromCollection(
                dialogTemplateInfo.template,
                dialogTemplateInfo.templateDir,
                zipData!, // Use zipData from the re-processed collection
                zipFiles! // Use zipFiles from the re-processed collection
              );
              importedCount++;
            } catch (importError) {
              Logger.Admin.error(
                `Error importing template ${
                  dialogTemplateInfo.template.title || "untitled"
                } from ${dialogTemplateInfo.templateDir}`,
                importError
              );
              // Continue with other templates even if one fails
            }
          }
        }
      } else {
        // JSON array import
        // Iterate over the templates the user saw and confirmed in the dialog
        for (const dialogTemplateInfo of collectionImportDialog.templates) {
          // Only import if it's new or newer
          if (
            !dialogTemplateInfo.existingTemplate ||
            dialogTemplateInfo.isNewer
          ) {
            try {
              await templateCore.createTemplate(dialogTemplateInfo.template);
              importedCount++;
            } catch (error) {
              Logger.Admin.error(
                `Failed to import template ${
                  dialogTemplateInfo.template.title || "untitled"
                } from JSON array`,
                error
              );
              // Continue with other templates
            }
          }
        }
      }

      Logger.Admin.log(
        `Successfully imported ${importedCount} templates from collection.`
      );
    } catch (error) {
      Logger.Admin.error("Error during collection import", error);
      notificationService.addErrorNotification(
        `Failed to import some templates from the collection. ${importedCount}/${totalToImport} imported.`
      );
    } finally {
      templateCore.setIsLoading(false);
      templateCore.revalidator.revalidate();
      closeCollectionImportDialog();
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

  const handleFileInputChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (file) {
      await processTemplateImport(file);
    }
    // Reset file input to allow re-uploading the same file
    if (event.target) {
      event.target.value = "";
    }
  };

  /**
   * Handle file input change for template collection
   */
  const handleCollectionFileInputChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (file) {
      await processTemplateCollectionImport(file);
    }
    // Reset file input to allow re-uploading the same file
    if (event.target) {
      event.target.value = "";
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
