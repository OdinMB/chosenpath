import { useState, useCallback, useRef } from "react";
import { Logger } from "shared/logger";
import { StoryTemplate } from "core/types";
import { sendTrackedRequest, withRequestId } from "shared/utils/requestUtils";
import {
  CreateTemplateRequest,
  DeleteResponse,
  SuccessResponse,
} from "core/types";
import { API_CONFIG } from "core/config";
import JSZip from "jszip";
import {
  findTemplateJsonInZip,
  parseTemplateFromZip,
} from "core/utils/zipUtils.js";

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
  const [importDialog, setImportDialog] = useState<{
    isOpen: boolean;
    file: File | null;
    existingTemplate: StoryTemplate | null;
    newTemplate: Partial<StoryTemplate> | null;
    isNewer: boolean;
  }>({
    isOpen: false,
    file: null,
    existingTemplate: null,
    newTemplate: null,
    isNewer: false,
  });
  const [collectionImportDialog, setCollectionImportDialog] = useState<{
    isOpen: boolean;
    file: File | null;
    summary: {
      total: number;
      new: number;
      newer: number;
      older: number;
      same: number;
    };
    templates: Array<{
      template: Partial<StoryTemplate>;
      existingTemplate: StoryTemplate | null;
      isNewer: boolean;
      templateDir: string;
      isSameAge?: boolean;
    }>;
  }>({
    isOpen: false,
    file: null,
    summary: { total: 0, new: 0, newer: 0, older: 0, same: 0 },
    templates: [],
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

  const formatDateTime = (dateString: string) => {
    if (!dateString) return "Unknown";

    const date = new Date(dateString);

    // Format: "2025-04-07 14:30:45"
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const seconds = String(date.getSeconds()).padStart(2, "0");

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
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

  /**
   * Import a ZIP file directly to a template
   * @param templateId - ID of the template
   * @param zipData - The ZIP file blob to upload
   */
  const importTemplateZip = async (
    templateId: string,
    zipData: Blob
  ): Promise<void> => {
    const formData = new FormData();
    formData.append("zip", zipData, "template-assets.zip");

    const url = `${
      API_CONFIG.DEFAULT_API_URL
    }/admin/templates/${templateId}/import?requestId=${crypto.randomUUID()}`;

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
  };

  /**
   * Import a template from a collection
   * @param templateData - Template data to import
   * @param templateDir - Directory containing the template in the ZIP
   * @param zipData - JSZip instance with loaded files
   * @param zipFiles - List of file paths in the ZIP
   */
  const importTemplateFromCollection = async (
    templateData: Partial<StoryTemplate>,
    templateDir: string,
    zipData: JSZip,
    zipFiles: string[]
  ): Promise<void> => {
    try {
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

      if (templateFiles.length > 0) {
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

        // Import directly to the template
        await importTemplateZip(createdTemplate.id, zipBlob);
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

  const importTemplate = async (
    templateData: Partial<StoryTemplate>,
    assetFiles?: string[],
    zipData?: JSZip,
    templateDir: string = ""
  ) => {
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

    // Upload asset files if provided
    if (assetFiles && assetFiles.length > 0 && zipData) {
      Logger.Admin.log(`Uploading ${assetFiles.length} asset files`);

      // Create a new zip with just the asset files
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

      // Generate the ZIP blob and upload directly
      const zipBlob = await assetZip.generateAsync({ type: "blob" });
      await importTemplateZip(createdTemplate.id, zipBlob);
    }

    Logger.Admin.log(
      `Successfully imported template: ${createdTemplate.title}`
    );

    // Refresh the templates list
    await loadTemplates();
  };

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

  const processTemplateImport = async (file: File) => {
    if (!file) return;

    Logger.Admin.log(`Processing template from file: ${file.name}`);
    setIsLoading(true);
    setError(null);

    try {
      // Handle different file types
      if (file.name.endsWith(".zip")) {
        try {
          // Handle ZIP file import
          const zip = new JSZip();
          const zipData = await zip.loadAsync(file);

          const zipFiles = Object.keys(zipData.files);
          Logger.Admin.log(`ZIP contains ${zipFiles.length} files/directories`);

          // Find template.json and asset files
          const { templateFile, templateDir, assetFiles } =
            await findTemplateJsonInZip(zipFiles, zipData);

          // Parse template data
          const templateData = await parseTemplateFromZip(templateFile);
          Logger.Admin.log(`Found template: ${templateData.title}`);

          // Check if template already exists
          const existingTemplate = findExistingTemplate(templateData);

          if (existingTemplate) {
            // Compare versions
            const isNewer = compareTemplateVersions(
              existingTemplate,
              templateData
            );

            // Open confirmation dialog
            setImportDialog({
              isOpen: true,
              file,
              existingTemplate,
              newTemplate: templateData,
              isNewer,
            });
            setIsLoading(false);
            return;
          }

          // No existing template, proceed with import
          await importTemplate(templateData, assetFiles, zipData, templateDir);
        } catch (zipError: Error | unknown) {
          Logger.Admin.error("ZIP processing error:", zipError);
          const errorMessage =
            zipError instanceof Error ? zipError.message : String(zipError);
          setError(`ZIP processing error: ${errorMessage}`);
          throw zipError;
        }
      } else {
        // Handle JSON file import
        const reader = new FileReader();

        reader.onload = async (e) => {
          try {
            const content = e.target?.result as string;
            const templateData = JSON.parse(content);

            // Check if template already exists
            const existingTemplate = findExistingTemplate(templateData);

            if (existingTemplate) {
              // Compare versions
              const isNewer = compareTemplateVersions(
                existingTemplate,
                templateData
              );

              // Open confirmation dialog
              setImportDialog({
                isOpen: true,
                file,
                existingTemplate,
                newTemplate: templateData,
                isNewer,
              });
              setIsLoading(false);
              return;
            }

            // No existing template, proceed with import
            await importTemplate(templateData);
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

      // Refresh templates list when done without confirmation
      await loadTemplates();
    } catch (error) {
      Logger.Admin.error("Failed to import template", error);
      setError("Failed to import template. Please check the file format.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleImportTemplate = (file: File) => {
    if (!file) return;
    Logger.Admin.log(`Importing template from file: ${file.name}`);
    processTemplateImport(file);
  };

  const confirmTemplateImport = async () => {
    if (!importDialog.file || !importDialog.newTemplate) return;

    setIsLoading(true);
    try {
      if (importDialog.file.name.endsWith(".zip")) {
        // Re-process the ZIP to get assets
        const zip = new JSZip();
        const zipData = await zip.loadAsync(importDialog.file);
        const zipFiles = Object.keys(zipData.files);
        const { assetFiles, templateDir } = await findTemplateJsonInZip(
          zipFiles,
          zipData
        );

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
      await loadTemplates();
    } catch (error) {
      Logger.Admin.error("Failed to import template after confirmation", error);
      setError("Failed to import template. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const closeImportDialog = () => {
    setImportDialog({
      isOpen: false,
      file: null,
      existingTemplate: null,
      newTemplate: null,
      isNewer: false,
    });
  };

  const processTemplateCollectionImport = async (file: File) => {
    if (!file) return;

    Logger.Admin.log(`Processing template collection from file: ${file.name}`);
    setIsLoading(true);
    setError(null);

    try {
      if (file.name.endsWith(".zip")) {
        try {
          const zip = new JSZip();
          const zipData = await zip.loadAsync(file);
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

          Logger.Admin.log(
            `Found ${rootDirs.size} top-level directories in ZIP`
          );

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
          const templateInfos: Array<{
            template: Partial<StoryTemplate>;
            existingTemplate: StoryTemplate | null;
            isNewer: boolean;
            templateDir: string;
            isSameAge?: boolean;
          }> = [];

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
              const isSameAge =
                existingTemplate &&
                templateData.updatedAt &&
                existingTemplate.updatedAt
                  ? new Date(templateData.updatedAt).getTime() ===
                    new Date(existingTemplate.updatedAt).getTime()
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
                `Error processing template from ${templateDir} for confirmation`,
                importError
              );
              // Continue with other templates even if one fails
            }
          }

          // Calculate summary
          const summary = {
            total: templateInfos.length,
            new: templateInfos.filter((info) => !info.existingTemplate).length,
            newer: templateInfos.filter(
              (info) => info.existingTemplate && info.isNewer
            ).length,
            older: templateInfos.filter(
              (info) =>
                info.existingTemplate && !info.isNewer && !info.isSameAge
            ).length,
            same: templateInfos.filter(
              (info) => info.existingTemplate && info.isSameAge
            ).length,
          };

          // Show confirmation dialog
          setCollectionImportDialog({
            isOpen: true,
            file,
            summary,
            templates: templateInfos,
          });
          setIsLoading(false);
          return;
        } catch (zipError: Error | unknown) {
          Logger.Admin.error("ZIP processing error:", zipError);
          const errorMessage =
            zipError instanceof Error ? zipError.message : String(zipError);
          setError(`ZIP processing error: ${errorMessage}`);
          throw zipError;
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

            // Process each template to prepare for confirmation
            const templateInfos = templatesData.map((templateData) => {
              const existingTemplate = findExistingTemplate(templateData);
              const isNewer = existingTemplate
                ? compareTemplateVersions(existingTemplate, templateData)
                : false;

              // Check if same age (same updatedAt timestamp)
              const isSameAge =
                existingTemplate &&
                templateData.updatedAt &&
                existingTemplate.updatedAt
                  ? new Date(templateData.updatedAt).getTime() ===
                    new Date(existingTemplate.updatedAt).getTime()
                  : false;

              return {
                template: templateData,
                existingTemplate,
                isNewer,
                templateDir: "", // JSON templates don't have a directory structure
                isSameAge,
              };
            });

            // Calculate summary
            const summary = {
              total: templateInfos.length,
              new: templateInfos.filter((info) => !info.existingTemplate)
                .length,
              newer: templateInfos.filter(
                (info) => info.existingTemplate && info.isNewer
              ).length,
              older: templateInfos.filter(
                (info) =>
                  info.existingTemplate && !info.isNewer && !info.isSameAge
              ).length,
              same: templateInfos.filter(
                (info) => info.existingTemplate && info.isSameAge
              ).length,
            };

            // Show confirmation dialog
            setCollectionImportDialog({
              isOpen: true,
              file,
              summary,
              templates: templateInfos,
            });
            setIsLoading(false);
            return;
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
    } catch (error) {
      Logger.Admin.error("Failed to import template collection", error);
      setError(
        "Failed to import template collection. Please check the file format."
      );
    } finally {
      setIsLoading(false);
    }
  };

  const confirmCollectionImport = async () => {
    if (
      !collectionImportDialog.file ||
      collectionImportDialog.templates.length === 0
    )
      return;

    setIsLoading(true);
    try {
      if (collectionImportDialog.file.name.endsWith(".zip")) {
        // Re-process the ZIP to import templates with assets
        const zip = new JSZip();
        const zipData = await zip.loadAsync(collectionImportDialog.file);
        const zipFiles = Object.keys(zipData.files);

        // Import each template from the dialog
        for (const templateInfo of collectionImportDialog.templates) {
          const templateDir = templateInfo.templateDir;

          try {
            // Import this template with all its assets from its directory
            await importTemplateFromCollection(
              templateInfo.template,
              templateDir,
              zipData,
              zipFiles
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
            const templateRequest: CreateTemplateRequest = withRequestId({
              template: templateInfo.template as Partial<StoryTemplate>,
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

            Logger.Admin.log(
              `Imported template: ${response.data.template.title}`
            );
          } catch (error) {
            Logger.Admin.error("Failed to import a template", error);
            // Continue with other templates
          }
        }
      }

      // Close dialog
      closeCollectionImportDialog();

      // Refresh templates list
      await loadTemplates();
    } catch (error) {
      Logger.Admin.error(
        "Failed to import template collection after confirmation",
        error
      );
      setError("Failed to import template collection. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const closeCollectionImportDialog = () => {
    setCollectionImportDialog({
      isOpen: false,
      file: null,
      summary: { total: 0, new: 0, newer: 0, older: 0, same: 0 },
      templates: [],
    });
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
    templates,
    isLoading,
    error,
    fileInputRef,
    collectionFileInputRef,
    deleteDialog,
    importDialog,
    collectionImportDialog,
    loadTemplates,
    formatDate,
    formatDateTime,
    handleDeleteTemplate,
    openDeleteDialog,
    closeDeleteDialog,
    confirmTemplateImport,
    closeImportDialog,
    confirmCollectionImport,
    closeCollectionImportDialog,
    handleExportTemplate,
    handleExportAllTemplates,
    handleFileInputChange,
    handleCollectionFileInputChange,
  };
};
