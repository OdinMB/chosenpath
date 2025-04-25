import { useState, useCallback, useRef } from "react";
import { Logger } from "shared/logger";
import { StoryTemplate } from "core/types";
import { sendTrackedRequest, withRequestId } from "shared/requestUtils";
import {
  CreateTemplateRequest,
  DeleteResponse,
  SuccessResponse,
} from "core/types";
import { API_CONFIG } from "core/config";
import * as JSZip from "jszip";

export const useTemplateLibrary = (token: string) => {
  const [templates, setTemplates] = useState<StoryTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const collectionFileInputRef = useRef<HTMLInputElement>(null);
  const [deleteDialog, setDeleteDialog] = useState<{
    isOpen: boolean;
    templateId: string;
  }>({
    isOpen: false,
    templateId: "",
  });

  const loadTemplates = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    Logger.Admin.log("Loading story templates");

    try {
      const response = await sendTrackedRequest<
        SuccessResponse<{ templates: StoryTemplate[] }>
      >({
        path: `/admin/templates`,
        method: "GET",
        token,
      });

      Logger.Admin.log(
        `Successfully loaded ${response.data.templates.length} story templates`
      );
      setTemplates(response.data.templates);
    } catch (error) {
      Logger.Admin.error("Failed to load story templates", error);
      setError("Failed to load story templates. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  const formatDate = (dateString: string) => {
    if (!dateString) return "Unknown";

    const date = new Date(dateString);

    // Format: "2025-04-07"
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  };

  const handleDeleteTemplate = async (templateId: string) => {
    Logger.Admin.log(`Attempting to delete template: ${templateId}`);
    try {
      const request = withRequestId({
        id: templateId,
      });

      await sendTrackedRequest<DeleteResponse>({
        path: `/admin/templates/${templateId}`,
        method: "DELETE",
        token,
        body: request,
      });

      Logger.Admin.log(`Successfully deleted template: ${templateId}`);
      // Refresh the list
      loadTemplates();
    } catch (error) {
      Logger.Admin.error(`Error deleting template: ${templateId}`, error);
      setError("Failed to delete template. Please try again.");
    }
  };

  const openDeleteDialog = (templateId: string) => {
    setDeleteDialog({
      isOpen: true,
      templateId,
    });
  };

  const closeDeleteDialog = () => {
    setDeleteDialog({
      isOpen: false,
      templateId: "",
    });
  };

  // Export a template (with assets)
  const handleExportTemplate = async (template: StoryTemplate) => {
    Logger.Admin.log(`Exporting template: ${template.id}`);
    setIsLoading(true);
    setError(null);

    try {
      // Fetch the template with assets from the server
      const assetsUrl = `${API_CONFIG.DEFAULT_API_URL}/admin/templates/${
        template.id
      }/assets?requestId=${crypto.randomUUID()}`;

      const response = await fetch(assetsUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch template: ${response.statusText}`);
      }

      // Get the blob from the response
      const blob = await response.blob();

      // Create a download link
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
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
      setError("Failed to export template. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // Export all templates (with assets)
  const handleExportAllTemplates = async () => {
    Logger.Admin.log("Exporting all templates");
    setIsLoading(true);
    setError(null);

    try {
      if (templates.length === 0) {
        setError("No templates to export");
        setIsLoading(false);
        return;
      }

      // Fetch all templates with assets from the server
      const assetsUrl = `${
        API_CONFIG.DEFAULT_API_URL
      }/admin/templates/all/assets?requestId=${crypto.randomUUID()}`;

      const response = await fetch(assetsUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch templates: ${response.statusText}`);
      }

      // Get the blob from the response
      const blob = await response.blob();

      // Create a download link
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
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
      setError("Failed to export all templates. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // Handle JSZip FormData uploads by creating a direct fetch instead of using sendTrackedRequest
  const uploadFileToTemplate = async (
    templateId: string,
    fileData: Blob,
    fileName: string
  ): Promise<void> => {
    const formData = new FormData();
    formData.append("file", fileData, fileName);

    const url = `${
      API_CONFIG.DEFAULT_API_URL
    }/admin/templates/${templateId}/files?requestId=${crypto.randomUUID()}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    if (!response.ok) {
      throw new Error(
        `Failed to upload file ${fileName}: ${response.statusText}`
      );
    }
  };

  const handleImportTemplate = async (file: File) => {
    if (!file) return;

    Logger.Admin.log(`Importing template from file: ${file.name}`);
    setIsLoading(true);
    setError(null);

    try {
      // Handle different file types
      if (file.name.endsWith(".zip")) {
        // Handle ZIP file import (directory structure)
        const zip = new JSZip();
        const zipData = await zip.loadAsync(file);

        // Find template directories (should be only one in a single template export)
        const dirEntries = Object.keys(zipData.files)
          .filter((path) => path.endsWith("/") && path.split("/").length === 2)
          .map((path) => path.slice(0, -1)); // Remove trailing slash

        if (dirEntries.length === 0) {
          throw new Error("No valid template directory found in ZIP");
        }

        // Process the template directory (just use the first one if multiple)
        const templateDir = dirEntries[0];

        // Find and read template.json
        const templateJsonPath = `${templateDir}/template.json`;
        const templateFile = zipData.files[templateJsonPath];

        if (!templateFile) {
          throw new Error(`No template.json found in ${templateDir}`);
        }

        // Parse template data
        const templateContent = await templateFile.async("text");
        const templateData = JSON.parse(templateContent);

        // Create template on server
        const templateRequest: CreateTemplateRequest = withRequestId({
          template: templateData as Partial<StoryTemplate>,
        });

        const response = await sendTrackedRequest<
          SuccessResponse<{ template: StoryTemplate }>,
          CreateTemplateRequest
        >({
          path: `/admin/templates`,
          method: "POST",
          token,
          body: templateRequest,
        });

        const createdTemplate = response.data.template;

        // Upload all other files in the directory
        const otherFiles = Object.keys(zipData.files).filter(
          (path) =>
            path.startsWith(`${templateDir}/`) &&
            path !== templateJsonPath &&
            !path.endsWith("/")
        );

        for (const filePath of otherFiles) {
          const fileData = await zipData.files[filePath].async("blob");
          const fileName = filePath.split("/").pop() || "";

          // Upload file to template directory
          await uploadFileToTemplate(createdTemplate.id, fileData, fileName);
        }

        Logger.Admin.log(
          `Imported template ${createdTemplate.id} with ${otherFiles.length} asset files`
        );
      } else {
        // Handle JSON file import
        const reader = new FileReader();

        reader.onload = async (e) => {
          try {
            const content = e.target?.result as string;
            const templateData = JSON.parse(content);

            // Create template on server
            const newTemplate: CreateTemplateRequest = withRequestId({
              template: templateData as Partial<StoryTemplate>,
            });

            const response = await sendTrackedRequest<
              SuccessResponse<{ template: StoryTemplate }>,
              CreateTemplateRequest
            >({
              path: `/admin/templates`,
              method: "POST",
              token,
              body: newTemplate,
            });

            Logger.Admin.log(
              `Imported template ${response.data.template.id} (JSON only)`
            );
          } catch (error) {
            Logger.Admin.error("Failed to import template", error);
            setError(
              "Failed to import template. Please check the file format."
            );
            throw error;
          }
        };

        reader.onerror = () => {
          Logger.Admin.error("Error reading file");
          setError("Failed to read the file. Please try again.");
          throw new Error("Failed to read file");
        };

        reader.readAsText(file);
      }

      // Refresh templates list
      await loadTemplates();

      // Clear file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error) {
      Logger.Admin.error("Failed to import template", error);
      setError("Failed to import template. Please check the file format.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleImportTemplateCollection = async (file: File) => {
    if (!file) return;

    Logger.Admin.log(`Importing template collection from file: ${file.name}`);
    setIsLoading(true);
    setError(null);

    try {
      if (file.name.endsWith(".zip")) {
        // Handle ZIP file import (directory structure)
        const zip = new JSZip();
        const zipData = await zip.loadAsync(file);

        // Find all template directories under templates/
        const templateDirs = Object.keys(zipData.files)
          .filter(
            (path) =>
              path.startsWith("templates/") &&
              path.endsWith("/") &&
              path.split("/").length === 3
          )
          .map((path) => path.slice(0, -1)); // Remove trailing slash

        if (templateDirs.length === 0) {
          throw new Error(
            "No template directories found in the templates/ directory"
          );
        }

        Logger.Admin.log(
          `Found ${templateDirs.length} templates in the ZIP file`
        );

        // Import each template
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
            const templateContent = await templateFile.async("text");
            const templateData = JSON.parse(templateContent);

            // Create template on server
            const templateRequest: CreateTemplateRequest = withRequestId({
              template: templateData as Partial<StoryTemplate>,
            });

            const response = await sendTrackedRequest<
              SuccessResponse<{ template: StoryTemplate }>,
              CreateTemplateRequest
            >({
              path: `/admin/templates`,
              method: "POST",
              token,
              body: templateRequest,
            });

            const createdTemplate = response.data.template;

            // Upload all other files in the directory
            const otherFiles = Object.keys(zipData.files).filter(
              (path) =>
                path.startsWith(`${templateDir}/`) &&
                path !== templateJsonPath &&
                !path.endsWith("/")
            );

            for (const filePath of otherFiles) {
              const fileData = await zipData.files[filePath].async("blob");
              const fileName = filePath.split("/").pop() || "";

              // Upload file to template directory
              await uploadFileToTemplate(
                createdTemplate.id,
                fileData,
                fileName
              );
            }

            Logger.Admin.log(
              `Imported template ${createdTemplate.id} with ${otherFiles.length} asset files`
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
        // Handle JSON array import
        const reader = new FileReader();

        reader.onload = async (e) => {
          try {
            const content = e.target?.result as string;
            const templatesData = JSON.parse(content);

            if (!Array.isArray(templatesData)) {
              throw new Error(
                "Invalid file format. Expected an array of templates."
              );
            }

            Logger.Admin.log(
              `Found ${templatesData.length} templates in JSON collection`
            );

            // Import each template
            for (const templateData of templatesData) {
              try {
                const newTemplate: CreateTemplateRequest = withRequestId({
                  template: templateData as Partial<StoryTemplate>,
                });

                const response = await sendTrackedRequest<
                  SuccessResponse<{ template: StoryTemplate }>,
                  CreateTemplateRequest
                >({
                  path: `/admin/templates`,
                  method: "POST",
                  token,
                  body: newTemplate,
                });

                Logger.Admin.log(
                  `Imported template ${response.data.template.id} (JSON only)`
                );
              } catch (templateError) {
                Logger.Admin.error(
                  "Failed to import a template",
                  templateError
                );
                // Continue with other templates
              }
            }
          } catch (error) {
            Logger.Admin.error("Failed to import template collection", error);
            setError(
              "Failed to import template collection. Please check the file format."
            );
            throw error;
          }
        };

        reader.onerror = () => {
          Logger.Admin.error("Error reading file");
          setError("Failed to read the file. Please try again.");
          throw new Error("Failed to read file");
        };

        reader.readAsText(file);
      }

      // Refresh templates list
      await loadTemplates();

      // Clear file input
      if (collectionFileInputRef.current) {
        collectionFileInputRef.current.value = "";
      }
    } catch (error) {
      Logger.Admin.error("Failed to import template collection", error);
      setError(
        "Failed to import template collection. Please check the file format."
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileInputChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (file) {
      handleImportTemplate(file);
    }
  };

  const handleCollectionFileInputChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (file) {
      handleImportTemplateCollection(file);
    }
  };

  return {
    templates,
    isLoading,
    error,
    fileInputRef,
    collectionFileInputRef,
    deleteDialog,
    loadTemplates,
    formatDate,
    handleDeleteTemplate,
    openDeleteDialog,
    closeDeleteDialog,
    handleExportTemplate,
    handleExportAllTemplates,
    handleFileInputChange,
    handleCollectionFileInputChange,
  };
};
