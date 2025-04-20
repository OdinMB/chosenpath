import { useState } from "react";
import {
  StoryTemplate,
  PlayerSlot,
  PlayerOptionsGeneration,
} from "@core/types";
import { SectionData, TemplateIterationRequest } from "@core/types/admin";
import { ResponseStatus } from "@core/types/api";
import { config } from "@/config";
import { Logger } from "@common/logger";
import { v4 as uuidv4 } from "uuid";

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
    if (!token || !template.id) {
      const errorMsg = "Invalid token or template ID for AI iteration";
      Logger.Admin.error(errorMsg);
      setError(errorMsg);
      throw new Error(errorMsg);
    }

    try {
      setError(null);
      setIsLoading(true);

      // Generate a UUID for request tracking
      const requestId = uuidv4();

      const requestData: TemplateIterationRequest = {
        requestId,
        templateId: template.id,
        feedback,
        sections,
        gameMode: template.gameMode,
        playerCount: template.playerCountMax,
        maxTurns: template.maxTurnsMin,
      };

      Logger.Admin.log("Sending AI iteration request:", {
        requestId,
        id: template.id,
        sections,
        gameMode: template.gameMode,
      });

      const response = await fetch(
        `${config.apiUrl}/admin/templates/${template.id}/iterate`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(requestData),
        }
      );

      const data = await response.json();
      Logger.Admin.log("AI iteration response received:", data);

      // Validate the response
      if (!response.ok) {
        let errorMsg = `Failed to generate AI iteration: ${response.status}`;

        // Try to extract error message from response if available
        if (data.status === ResponseStatus.ERROR && data.errorMessage) {
          errorMsg = data.errorMessage;
        } else if (typeof data === "string") {
          errorMsg += ` ${data}`;
        }

        Logger.Admin.error(errorMsg);
        setError(errorMsg);
        throw new Error(errorMsg);
      }

      // Check for rate limiting
      if (data.status === ResponseStatus.RATE_LIMITED) {
        const rateLimitMsg = `Rate limited: Please try again in ${Math.ceil(
          data.rateLimit.timeRemaining / 1000
        )} seconds`;
        Logger.Admin.error(rateLimitMsg, data.rateLimit);
        setError(rateLimitMsg);
        throw new Error(rateLimitMsg);
      }

      // Verify it's a success response with expected data
      if (
        data.status !== ResponseStatus.SUCCESS ||
        !data.data ||
        !data.data.templateUpdate ||
        Object.keys(data.data.templateUpdate).length === 0
      ) {
        const errorMsg = "AI iteration response did not contain valid updates";
        Logger.Admin.error(errorMsg, data);
        setError(errorMsg);
        throw new Error(errorMsg);
      }

      // Check if the request IDs match
      if (data.requestId !== requestId) {
        Logger.Admin.warn(
          `Request ID mismatch: sent ${requestId}, received ${data.requestId}`
        );
      }

      // Process and restructure the template update data
      const templateUpdate = data.data.templateUpdate;
      const processedData = processPotentialPlayerData(templateUpdate);

      setIterationData(processedData);
      setIsModalOpen(true);
      return processedData;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      Logger.Admin.error("Error in AI iteration:", errorMsg);
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
