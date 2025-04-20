import { useState } from "react";
import { Logger } from "@common/logger";
import { sendTrackedRequest, withRequestId } from "@/shared/requestUtils";
import {
  PlayerSlot,
  PlayerOptionsGeneration,
  SectionData,
  StoryTemplate,
  TemplateIterationRequest,
  TemplateIterationResponse,
} from "@core/types";

interface UseAiIterationProps {
  token: string;
  setIsLoading: (isLoading: boolean) => void;
}

export function useAiIteration({ token, setIsLoading }: UseAiIterationProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [iterationData, setIterationData] = useState<SectionData>({});
  const [error, setError] = useState<string | null>(null);

  const requestAiIteration = async (
    template: StoryTemplate,
    feedback: string,
    sections: Array<keyof SectionData>
  ) => {
    if (!template.id) {
      const errorMsg = "Invalid template ID for AI iteration";
      Logger.Admin.error(errorMsg);
      setError(errorMsg);
      throw new Error(errorMsg);
    }

    try {
      setError(null);
      setIsLoading(true);

      // Create a request with the proper type and add requestId
      const request: TemplateIterationRequest = withRequestId({
        templateId: template.id,
        feedback,
        sections,
        gameMode: template.gameMode,
        playerCount: template.playerCountMax,
        maxTurns: template.maxTurnsMin,
      });

      // Make the API request with specific request and response types
      const response = await sendTrackedRequest<
        TemplateIterationResponse,
        TemplateIterationRequest
      >({
        path: `/admin/templates/${template.id}/iterate`,
        method: "POST",
        token,
        body: request,
      });

      const templateUpdate = response.data.templateUpdate;

      // Process and restructure the template update data
      const processedData = processPotentialPlayerData(templateUpdate);

      setIterationData(processedData);
      setIsModalOpen(true);
      return processedData;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      setError(errorMsg);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // Process the server response to restructure player data if needed
  const processPotentialPlayerData = (data: SectionData): SectionData => {
    const processedData: SectionData = { ...data };
    const playerKeys = Object.keys(data).filter((key) =>
      key.startsWith("player")
    );

    if (playerKeys.length > 0) {
      // Extract player data and create playerOptions structure
      const playerOptions: Record<PlayerSlot, PlayerOptionsGeneration> = {};

      playerKeys.forEach((key) => {
        // Add to playerOptions
        playerOptions[key as PlayerSlot] = data[
          key as keyof SectionData
        ] as PlayerOptionsGeneration;
        // Remove from root
        delete processedData[key as keyof SectionData];
      });

      // Add players structure that contains playerOptions
      processedData.players = {
        playerOptions,
        characterSelectionIntroduction: data.characterSelectionIntroduction,
      };

      // Remove characterSelectionIntroduction from root if it exists
      if (processedData.characterSelectionIntroduction) {
        delete processedData.characterSelectionIntroduction;
      }
    }

    Logger.Admin.log("Processed AI iteration data:", processedData);
    return processedData;
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
  };

  const handleAcceptSection = (
    sectionKey: keyof SectionData,
    data: unknown
  ) => {
    // Handle the acceptance of a section
    Logger.Admin.log(`Accepted section: ${String(sectionKey)}`, data);

    // Clear the data for that section since it's been accepted
    setIterationData((prev) => {
      const updated = { ...prev };
      delete updated[sectionKey];

      // If no more sections, close the modal
      if (Object.keys(updated).length === 0) {
        setIsModalOpen(false);
      }

      return updated;
    });

    return data;
  };

  return {
    isModalOpen,
    iterationData,
    requestAiIteration,
    handleCloseModal,
    handleAcceptSection,
    error,
  };
}
