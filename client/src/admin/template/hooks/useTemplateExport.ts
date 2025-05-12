import { StoryTemplate } from "core/types";
import { Logger } from "shared/logger";
import { adminTemplateApi } from "admin/adminApi";

// Interface for templateCore to use for loading state
interface TemplateCore {
  setIsLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useTemplateExport = (templateCore: TemplateCore) => {
  // Export a single template
  const handleExportTemplate = async (template: StoryTemplate) => {
    Logger.Admin.log(`Exporting template: ${template.title}`);
    templateCore.setIsLoading(true);
    templateCore.setError(null);

    try {
      const response = await adminTemplateApi.exportTemplate(template.id);
      const blob = new Blob([JSON.stringify(response.template, null, 2)], {
        type: "application/json",
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${template.title.toLowerCase().replace(/\s+/g, "-")}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      Logger.Admin.error(`Error exporting template: ${template.title}`, error);
      templateCore.setError("Failed to export template. Please try again.");
    } finally {
      templateCore.setIsLoading(false);
    }
  };

  // Export all templates
  const handleExportAllTemplates = async () => {
    Logger.Admin.log("Exporting all templates");
    templateCore.setIsLoading(true);
    templateCore.setError(null);

    try {
      const response = await adminTemplateApi.exportAllTemplates();
      const blob = new Blob([JSON.stringify(response.templates, null, 2)], {
        type: "application/json",
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "templates.json";
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      Logger.Admin.error("Error exporting all templates", error);
      templateCore.setError("Failed to export templates. Please try again.");
    } finally {
      templateCore.setIsLoading(false);
    }
  };

  return {
    handleExportTemplate,
    handleExportAllTemplates,
  };
};
