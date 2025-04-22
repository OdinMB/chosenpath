import { useState } from "react";
import { Logger } from "shared/logger";
import { sendTrackedRequest, withRequestId } from "shared/requestUtils";
import {
  StoryTemplate,
  TemplateIterationRequest,
  TemplateIterationResponse,
  TemplateIterationSections,
} from "core/types";
import { templateIterationSections } from "core/utils/templateIterationSections";

interface UseAiIterationProps {
  token: string;
  setIsLoading: (isLoading: boolean) => void;
}

export function useAiIteration({ token, setIsLoading }: UseAiIterationProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [iterationData, setIterationData] = useState<Partial<StoryTemplate>>(
    {}
  );
  const [error, setError] = useState<string | null>(null);

  const requestAiIteration = async (
    template: StoryTemplate,
    feedback: string,
    sections: TemplateIterationSections[]
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
        sections: sections as TemplateIterationSections[],
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

      const templateUpdate: Partial<StoryTemplate> =
        response.data.templateUpdate;

      Logger.Admin.log("AI partial StoryTemplate:", templateUpdate);

      setIterationData(templateUpdate);
      setIsModalOpen(true);
      return templateUpdate;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      Logger.Admin.error("AI iteration error:", errorMsg);
      setError(errorMsg);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
  };

  // Clears the modal data for the section that was accepted
  const handleAcceptSection = (
    sectionKey: TemplateIterationSections,
    data: Partial<StoryTemplate>
  ) => {
    // Handle the acceptance of a section
    Logger.Admin.log(`Accepted section: ${String(sectionKey)}`, data);

    // Clear the data for that section since it's been accepted
    setIterationData((prev) => {
      const updated = { ...prev };

      // Delete all fields related to the selected section
      if (sectionKey in templateIterationSections) {
        const fieldsToDelete = templateIterationSections[sectionKey];
        // Delete each field
        fieldsToDelete.forEach((field: string) => {
          delete updated[field as keyof Partial<StoryTemplate>];
        });

        // Special handling for players section - also delete player1-n fields
        if (sectionKey === "players") {
          Object.keys(updated).forEach((key) => {
            if (key.startsWith("player")) {
              delete updated[key as keyof Partial<StoryTemplate>];
            }
          });
        }
      }

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
