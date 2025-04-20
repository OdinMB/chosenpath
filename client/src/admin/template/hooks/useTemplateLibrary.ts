import { useState, useCallback, useRef } from "react";
import { Logger } from "@common/logger";
import { StoryTemplate, PublicationStatus, GameModes } from "@core/types";
import { sendTrackedRequest, withRequestId } from "@/shared/requestUtils";
import {
  CreateTemplateRequest,
  DeleteResponse,
  SuccessResponse,
} from "@core/types";

export const useTemplateLibrary = (token: string) => {
  const [templates, setTemplates] = useState<StoryTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  const handleExportTemplate = (template: StoryTemplate) => {
    Logger.Admin.log(`Exporting template: ${template.id}`);

    try {
      // Create a blob with the JSON data
      const json = JSON.stringify(template, null, 2);
      const blob = new Blob([json], { type: "application/json" });

      // Create an object URL for the blob
      const url = URL.createObjectURL(blob);

      // Create a download link and trigger it
      const a = document.createElement("a");
      a.href = url;
      a.download = `${template.title
        .replace(/\s+/g, "-")
        .toLowerCase()}-template.json`;
      document.body.appendChild(a);
      a.click();

      // Clean up
      URL.revokeObjectURL(url);
      document.body.removeChild(a);

      Logger.Admin.log(`Successfully exported template: ${template.id}`);
    } catch (error) {
      Logger.Admin.error(`Error exporting template: ${template.id}`, error);
      setError("Failed to export template. Please try again.");
    }
  };

  const handleImportTemplate = async (file: File) => {
    if (!file) return;

    Logger.Admin.log(`Importing template from file: ${file.name}`);

    return new Promise<void>((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = async (e) => {
        try {
          const content = e.target?.result as string;
          const templateData = JSON.parse(content);

          // Create a new template with essential fields
          const newTemplate: CreateTemplateRequest = withRequestId({
            title: templateData.title || "Imported Template",
            publicationStatus: PublicationStatus.Draft,
            playerCountMin: templateData.playerCountMin,
            playerCountMax: templateData.playerCountMax,
            maxTurnsMin: templateData.maxTurnsMin,
            maxTurnsMax: templateData.maxTurnsMax,
            gameMode: templateData.gameMode || GameModes.SinglePlayer,
            tags: templateData.tags || [],
            teaser: templateData.teaser || "",
            guidelines: templateData.guidelines || {
              world: "",
              rules: [],
              tone: [],
              conflicts: [],
              decisions: [],
            },
            storyElements: templateData.storyElements || [],
            sharedOutcomes: templateData.sharedOutcomes || [],
            statGroups: templateData.statGroups || [],
            sharedStats: templateData.sharedStats || [],
            initialSharedStatValues: templateData.initialSharedStatValues || [],
            playerStats: templateData.playerStats || [],
            characterSelectionIntroduction:
              templateData.characterSelectionIntroduction || {
                title: "",
                text: "",
              },
          });

          // Send to server
          await sendTrackedRequest<
            SuccessResponse<{ template: StoryTemplate }>,
            CreateTemplateRequest
          >({
            path: `/admin/templates`,
            method: "POST",
            token,
            body: newTemplate,
          });

          Logger.Admin.log("Template imported successfully");

          // Refresh templates list
          loadTemplates();

          // Clear file input
          if (fileInputRef.current) {
            fileInputRef.current.value = "";
          }

          resolve();
        } catch (error) {
          Logger.Admin.error("Failed to import template", error);
          setError("Failed to import template. Please check the file format.");
          reject(error);
        }
      };

      reader.onerror = () => {
        Logger.Admin.error("Error reading file");
        setError("Failed to read the file. Please try again.");
        reject(new Error("Failed to read file"));
      };

      reader.readAsText(file);
    });
  };

  const handleFileInputChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (file) {
      handleImportTemplate(file);
    }
  };

  return {
    templates,
    isLoading,
    error,
    fileInputRef,
    deleteDialog,
    loadTemplates,
    formatDate,
    handleDeleteTemplate,
    openDeleteDialog,
    closeDeleteDialog,
    handleExportTemplate,
    handleFileInputChange,
  };
};
