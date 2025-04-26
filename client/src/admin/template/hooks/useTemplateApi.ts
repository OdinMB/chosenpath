import { StoryTemplate, GameMode, PlayerCount } from "core/types";
import {
  UpdateTemplateRequest,
  GenerateTemplateRequest,
} from "core/types/admin";
import { Logger } from "shared/logger";
import { sendTrackedRequest, withRequestId } from "shared/utils/requestUtils";
import { SuccessResponse } from "core/types/api";

interface UseTemplateApiProps {
  token: string;
  onSuccess: (template: StoryTemplate) => void;
  setIsLoading: (isLoading: boolean) => void;
}

export function useTemplateApi({
  token,
  onSuccess,
  setIsLoading,
}: UseTemplateApiProps) {
  // Save template to the server
  const saveTemplate = async (template: StoryTemplate) => {
    try {
      setIsLoading(true);
      Logger.Admin.log("Saving template", template);

      if (!template.id) {
        Logger.Admin.error("Cannot update template without an ID");
        throw new Error("Template has no ID");
      }

      const request: UpdateTemplateRequest = withRequestId({
        id: template.id,
        template: template,
      });

      const response = await sendTrackedRequest<
        SuccessResponse<{ template: StoryTemplate }>,
        UpdateTemplateRequest
      >({
        path: `/admin/templates/${template.id}`,
        method: "PUT",
        token,
        body: request,
      });

      Logger.Admin.log("Template saved successfully", response);

      // Pass the updated template back to the parent component
      onSuccess(response.data.template);
      return response.data.template;
    } catch (error) {
      Logger.Admin.error("Error saving template:", error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // Generate template using AI
  const generateTemplate = async (options: {
    prompt: string;
    playerCount: number;
    maxTurns: number;
    gameMode: GameMode;
    currentTemplate: StoryTemplate;
    onUpdate: (tab: string) => void;
  }) => {
    setIsLoading(true);

    try {
      const {
        prompt,
        playerCount,
        maxTurns,
        gameMode,
        currentTemplate,
        onUpdate,
      } = options;

      // Always use the provided playerCount value from StoryInitializer
      const effectivePlayerCount = Math.max(
        playerCount,
        currentTemplate.playerCountMax
      ) as PlayerCount;

      // Use other form values if available
      const effectiveMaxTurns = Math.max(currentTemplate.maxTurnsMin, maxTurns);
      const effectiveGameMode = gameMode;

      // First, call API to generate template content
      const request: GenerateTemplateRequest = withRequestId({
        prompt,
        playerCount: effectivePlayerCount,
        maxTurns: effectiveMaxTurns,
        gameMode: effectiveGameMode,
        generateImages: false,
      });

      const response = await sendTrackedRequest<
        SuccessResponse<{ template: StoryTemplate }>,
        GenerateTemplateRequest
      >({
        path: `/admin/templates/generate`,
        method: "POST",
        token,
        body: request,
      });

      const generatedTemplate = response.data.template;

      if (!currentTemplate.id) {
        Logger.Admin.error("Cannot update template without an ID");
        throw new Error("Template has no ID");
      }

      // Create update object by merging generated content with the current formData ID
      const updateData = {
        ...generatedTemplate,
        id: currentTemplate.id,
      };

      // Now update the template on the server
      const updatedTemplate = await saveTemplate(updateData);
      onUpdate("basic");

      return updatedTemplate;
    } catch (error) {
      Logger.Admin.error("Error generating or updating template:", error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    saveTemplate,
    generateTemplate,
  };
}
