import { useTemplateCore } from "./useTemplateCore";
import { useTemplateProcessing } from "./useTemplateProcessing";
import { useTemplateImport } from "./useTemplateImport";
import { useTemplateExport } from "./useTemplateExport";
import { StoryTemplate } from "core/types";

export const useTemplateLibrary = (initialTemplates: StoryTemplate[]) => {
  // Initialize the core hook for basic template operations
  const templateCore = useTemplateCore(initialTemplates);

  // Initialize template processing hook (passing templates from core)
  const templateProcessing = useTemplateProcessing(templateCore.templates);

  // Initialize template import hook (passing processing and core utilities)
  const templateImport = useTemplateImport(
    {
      processTemplateFile: templateProcessing.processTemplateFile,
      processCollectionFile: templateProcessing.processCollectionFile,
      findExistingTemplate: templateProcessing.findExistingTemplate,
      compareTemplateVersions: templateProcessing.compareTemplateVersions,
    },
    {
      createTemplate: templateCore.createTemplate,
      revalidator: templateCore.revalidator,
      setIsLoading: templateCore.setIsLoading,
      setError: templateCore.setError,
    }
  );

  // Initialize template export hook (passing core utilities)
  const templateExport = useTemplateExport({
    setIsLoading: templateCore.setIsLoading,
    setError: templateCore.setError,
  });

  // Compose and return all the functionality
  return {
    // Core template operations and state
    templates: templateCore.templates,
    error: templateCore.error,
    deleteDialog: templateCore.deleteDialog,
    revalidator: templateCore.revalidator,
    handleDeleteTemplate: templateCore.handleDeleteTemplate,
    openDeleteDialog: templateCore.openDeleteDialog,
    closeDeleteDialog: templateCore.closeDeleteDialog,

    // Date formatting utilities
    formatDate: templateCore.formatDate,
    formatDateTime: templateCore.formatDateTime,

    // Import operations and state
    fileInputRef: templateImport.fileInputRef,
    collectionFileInputRef: templateImport.collectionFileInputRef,
    importDialog: templateImport.importDialog,
    collectionImportDialog: templateImport.collectionImportDialog,
    confirmTemplateImport: templateImport.confirmTemplateImport,
    closeImportDialog: templateImport.closeImportDialog,
    confirmCollectionImport: templateImport.confirmCollectionImport,
    closeCollectionImportDialog: templateImport.closeCollectionImportDialog,
    handleFileInputChange: templateImport.handleFileInputChange,
    handleCollectionFileInputChange:
      templateImport.handleCollectionFileInputChange,

    // Export operations
    handleExportTemplate: templateExport.handleExportTemplate,
    handleExportAllTemplates: templateExport.handleExportAllTemplates,
  };
};
