import { useState } from "react";
import { Logger } from "shared/logger";
import {
  StoryTemplate,
  TemplateIterationRequest,
  TemplateIterationSections,
} from "core/types";
import { templateIterationSections } from "core/utils/templateIterationSections";
import { notificationService } from "../../../shared/notifications/notificationService";
import { templateApi } from "../templateApi";

// No props needed for this hook anymore
// interface UseAiIterationProps {}

export function useAiIteration() {
  // Props removed
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [iterationData, setIterationData] = useState<Partial<StoryTemplate>>(
    {}
  );
  const [isIterating, setIsIterating] = useState(false);

  const requestAiIteration = async (
    template: StoryTemplate,
    feedback: string,
    sections: TemplateIterationSections[]
  ) => {
    if (!template.id) {
      const errorMsg = "Invalid template ID for AI iteration";
      Logger.Admin.error(errorMsg);
      notificationService.addErrorNotification(errorMsg);
      throw new Error(errorMsg);
    }

    try {
      setIsIterating(true);

      const request: TemplateIterationRequest = {
        templateId: template.id,
        feedback,
        sections: sections as TemplateIterationSections[],
        gameMode: template.gameMode,
        playerCount: template.playerCountMax,
        maxTurns: template.maxTurnsMin,
      };

      const response = await templateApi.iterateTemplate(
        request.templateId,
        request
      );
      const templateUpdate = response.templateUpdate;

      Logger.Admin.log("AI partial StoryTemplate:", templateUpdate);

      setIterationData(templateUpdate);
      setIsModalOpen(true);
      return templateUpdate;
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : "AI iteration failed";
      Logger.Admin.error("AI iteration error:", errorMsg);
      notificationService.addErrorNotification(errorMsg);
      throw err;
    } finally {
      setIsIterating(false);
    }
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
  };

  const handleAcceptSection = (
    sectionKey: TemplateIterationSections,
    data: Partial<StoryTemplate>
  ) => {
    Logger.Admin.log(`Accepted section: ${String(sectionKey)}`, data);

    setIterationData((prev) => {
      const updated = { ...prev };

      if (sectionKey in templateIterationSections) {
        const fieldsToDelete = templateIterationSections[sectionKey];
        fieldsToDelete.forEach((field: string) => {
          delete updated[field as keyof Partial<StoryTemplate>];
        });

        if (sectionKey === "players") {
          Object.keys(updated).forEach((key) => {
            if (key.startsWith("player")) {
              delete updated[key as keyof Partial<StoryTemplate>];
            }
          });
        }
      }

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
    isLoading: isIterating,
  };
}
