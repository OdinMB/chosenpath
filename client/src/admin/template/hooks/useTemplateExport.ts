import { StoryTemplate } from "core/types";
import { Logger } from "shared/logger";
import { adminApi } from "admin/adminApi";

// Interface for templateCore to use for loading state
interface TemplateCore {
  setIsLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useTemplateExport = (
  token: string,
  templateCore: TemplateCore
) => {
  // Export a template (with assets)
  const handleExportTemplate = async (template: StoryTemplate) => {
    Logger.Admin.log(`Exporting template: ${template.id}`);
    templateCore.setIsLoading(true);
    templateCore.setError(null);

    try {
      // Use the adminApi.get method with the admin token
      const response = await adminApi.get(
        `/admin/templates/${template.id}/assets`,
        token,
        { responseType: "blob" }
      );

      // Create a download link
      const link = document.createElement("a");
      link.href = URL.createObjectURL(response.data);
      link.download = `${template.title
        .replace(/\s+/g, "-")
        .toLowerCase()}.zip`;
      document.body.appendChild(link);
      link.click();

      // Clean up
      URL.revokeObjectURL(link.href);
      document.body.removeChild(link);

      Logger.Admin.log(`Successfully exported template: ${template.id}`);
    } catch (error) {
      Logger.Admin.error(`Error exporting template: ${template.id}`, error);
      templateCore.setError("Failed to export template. Please try again.");
    } finally {
      templateCore.setIsLoading(false);
    }
  };

  // Export all templates (with assets)
  const handleExportAllTemplates = async () => {
    Logger.Admin.log("Exporting all templates");
    templateCore.setIsLoading(true);
    templateCore.setError(null);

    try {
      // Use the adminApi.get method with the admin token
      const response = await adminApi.get(
        "/admin/templates/all/assets",
        token,
        { responseType: "blob" }
      );

      // Create a download link
      const link = document.createElement("a");
      link.href = URL.createObjectURL(response.data);
      link.download = `all-templates-${
        new Date().toISOString().split("T")[0]
      }.zip`;
      document.body.appendChild(link);
      link.click();

      // Clean up
      URL.revokeObjectURL(link.href);
      document.body.removeChild(link);

      Logger.Admin.log(`Successfully exported all templates`);
    } catch (error) {
      Logger.Admin.error("Error exporting all templates", error);
      templateCore.setError(
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
