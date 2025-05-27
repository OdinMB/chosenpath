import { StoryTemplate } from "core/types";
import { Logger } from "shared/logger";
import { templateApi } from "../templateApi";
import { notificationService } from "shared/notifications/notificationService";

// Interface for templateCore to use for loading state
interface TemplateCore {
  setIsLoading: (isLoading: boolean) => void;
}

export const useTemplateExport = (templateCore: TemplateCore) => {
  const triggerDownload = (blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename; // Use the suggested filename
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  // Export a single template (with its assets) as a ZIP
  const handleExportTemplate = async (template: StoryTemplate) => {
    Logger.UI.log(`Exporting template assets: ${template.title}`);
    templateCore.setIsLoading(true);

    try {
      const zipBlob = await templateApi.exportTemplates([template.id]);
      // Suggest a filename, browser might use Content-Disposition from server
      const filename = `${template.title
        .toLowerCase()
        .replace(/\s+/g, "-")}.zip`;
      triggerDownload(zipBlob, filename);
    } catch (error) {
      Logger.UI.error(
        `Error exporting template assets: ${template.title}`,
        error
      );
      notificationService.addErrorNotification(
        "Failed to export template. Please try again."
      );
    } finally {
      templateCore.setIsLoading(false);
    }
  };

  // Export all templates (with their assets) as a ZIP
  const handleExportAllTemplates = async () => {
    Logger.UI.log("Exporting all template assets");
    templateCore.setIsLoading(true);

    try {
      // Get all templates the user has access to and export them
      const templates = await templateApi.getAllTemplates();
      const templateIds = templates.map(
        (template: StoryTemplate) => template.id
      );
      const zipBlob = await templateApi.exportTemplates(templateIds);

      // Suggest a filename
      const filename = `all-templates-${
        new Date().toISOString().split("T")[0]
      }.zip`;
      triggerDownload(zipBlob, filename);
    } catch (error) {
      Logger.UI.error("Error exporting all template assets", error);
      notificationService.addErrorNotification(
        "Failed to export all templates. Please try again."
      );
    } finally {
      templateCore.setIsLoading(false);
    }
  };

  return {
    handleExportTemplate,
    handleExportAllTemplates,
  };
};
