import {
  StoryTemplate,
  GameMode,
  PLAYER_SLOTS,
  PublicationStatus,
} from "@core/types";
import { Logger } from "@common/logger";
import { config } from "@/config";
import { MAX_PLAYERS } from "@core/config";

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
  // Create request body for API call
  const createRequestBody = (template: StoryTemplate) => {
    // Create a base request body with common fields
    const baseRequestBody = {
      playerCountMin: template.playerCountMin,
      playerCountMax: template.playerCountMax,
      gameMode: template.gameMode,
      maxTurnsMin: template.maxTurnsMin,
      maxTurnsMax: template.maxTurnsMax,
      teaser: template.teaser,
      tags: template.tags,
      title: template.title,
      publicationStatus: template.publicationStatus || PublicationStatus.Draft,
      showOnWelcomeScreen: template.showOnWelcomeScreen || false,
      order: template.order,
      guidelines: template.guidelines,
      storyElements: template.storyElements,
      sharedOutcomes: template.sharedOutcomes,
      statGroups: template.statGroups,
      sharedStats: template.sharedStats,
      initialSharedStatValues: template.initialSharedStatValues,
      playerStats: template.playerStats,
      characterSelectionIntroduction: template.characterSelectionIntroduction,
    };

    // Add player options dynamically using PLAYER_SLOTS
    const playerOptions: Record<string, unknown> = {};
    const relevantPlayerSlots = PLAYER_SLOTS.slice(0, MAX_PLAYERS);

    for (const playerSlot of relevantPlayerSlots) {
      if (playerSlot in template) {
        playerOptions[playerSlot] = template[playerSlot as keyof StoryTemplate];
      }
    }

    // Combine base request body with player options
    return { ...baseRequestBody, ...playerOptions };
  };

  // Save template to the server
  const saveTemplate = async (template: StoryTemplate) => {
    try {
      setIsLoading(true);
      Logger.Admin.log("Saving template", template);

      if (!template.id) {
        Logger.Admin.error("Cannot update template without an ID");
        throw new Error("Template has no ID");
      }

      const url = `${config.apiUrl}/admin/templates/${template.id}`;
      const requestBody = createRequestBody(template);

      Logger.Admin.log("Request payload:", requestBody);

      const response = await fetch(url, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        Logger.Admin.error(`API error (${response.status}): ${errorText}`);
        throw new Error("Failed to update template");
      }

      const data = await response.json();
      Logger.Admin.log("Template saved successfully", data);

      // Pass the updated template back to the parent component
      onSuccess(data.template);
      return data.template;
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

      // Use form values if available
      const effectivePlayerCount =
        currentTemplate.playerCountMin > 0
          ? currentTemplate.playerCountMin
          : playerCount;
      const effectiveMaxTurns =
        currentTemplate.maxTurnsMin > 0
          ? currentTemplate.maxTurnsMin
          : maxTurns;
      const effectiveGameMode = currentTemplate.gameMode || gameMode;

      // First, call API to generate template content
      const generateResponse = await fetch(
        `${config.apiUrl}/admin/templates/generate`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            prompt,
            playerCount: effectivePlayerCount,
            maxTurns: effectiveMaxTurns,
            gameMode: effectiveGameMode,
          }),
        }
      );

      if (!generateResponse.ok) {
        throw new Error("Failed to generate template");
      }

      const data = await generateResponse.json();
      const generatedTemplate = data.template;

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
