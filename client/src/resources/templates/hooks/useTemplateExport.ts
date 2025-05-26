import { StoryTemplate } from "core/types";
import { Logger } from "shared/logger";
import { adminTemplateApi } from "admin/adminApi";
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
    Logger.Admin.log(`Exporting template assets: ${template.title}`);
    templateCore.setIsLoading(true);

    try {
      const zipBlob = await adminTemplateApi.exportTemplate(template.id);
      // Suggest a filename, browser might use Content-Disposition from server
      const filename = `${template.title
        .toLowerCase()
        .replace(/\s+/g, "-")}.zip`;
      triggerDownload(zipBlob, filename);
    } catch (error) {
      Logger.Admin.error(
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
    Logger.Admin.log("Exporting all template assets");
    templateCore.setIsLoading(true);

    try {
      const zipBlob = await adminTemplateApi.exportAllTemplates();
      // Suggest a filename
      const filename = `all-templates-${
        new Date().toISOString().split("T")[0]
      }.zip`;
      triggerDownload(zipBlob, filename);
    } catch (error) {
      Logger.Admin.error("Error exporting all template assets", error);
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
