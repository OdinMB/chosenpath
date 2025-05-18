import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Logger } from "shared/logger";
import { storyApi } from "shared/apiClient";
import {
  CreateStoryRequest,
  CreateStoryFromTemplateRequest,
  CreateStoryInfo,
  // ModerationBlockedResponse, // Not directly needed if relying on interceptor for notification details
  // ResponseStatus, // Not directly needed for status check in hook if interceptor handles it
} from "core/types/api";
import { deleteCodeSetsByContent } from "../../shared/utils/codeSetUtils"; // Added
// notificationService can be kept for non-API related notifications like polling errors, if any.
// import { notificationService } from "../../shared/notifications/notificationService"; // Removed as unused

export function useStoryCreation() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [storyId, setStoryId] = useState<string | null>(null);
  const [playerCodes, setPlayerCodes] = useState<Record<string, string> | null>(
    null
  );
  const [storyReady, setStoryReady] = useState(false);

  // Centralized error handler for story creation
  const handleError = (
    error: unknown,
    codesToDelete?: Record<string, string> | null
  ) => {
    Logger.App.error("Story creation process failed:", error);
    setIsLoading(false);

    if (codesToDelete) {
      deleteCodeSetsByContent(codesToDelete);
      Logger.App.log("Attempted to delete local player codes.", codesToDelete);
    }

    // Notifications are primarily handled by the apiClient's response interceptor.
    // This function's main jobs are cleanup and navigation.
    navigate("/");
    Logger.App.log("Redirected to / after story creation failure.");
  };

  const createStory = async (
    data: CreateStoryRequest
  ): Promise<CreateStoryInfo | undefined> => {
    setIsLoading(true);
    Logger.App.log("Starting story creation process (new)");
    let localPlayerCodes: Record<string, string> | null = null;

    try {
      Logger.App.log("Sending createStory request to server");
      const storyData = await storyApi.createStory(data);
      localPlayerCodes = storyData.codes; // Store codes locally in case polling setup fails

      Logger.App.log(`Received story ID: ${storyData.storyId}`);
      setStoryId(storyData.storyId);
      setPlayerCodes(storyData.codes);
      Logger.App.log("Received player codes, starting status polling");

      const checkStatus = async () => {
        try {
          Logger.App.log(`Checking status for story: ${storyData.storyId}`);
          const statusResult = await storyApi.checkStoryStatus(
            storyData.storyId
          );
          if (statusResult.status === "ready") {
            Logger.App.log(`Story ${storyData.storyId} is ready`);
            setStoryReady(true);
          } else {
            Logger.App.log(
              `Story ${storyData.storyId} is still queued, will check again in 2s`
            );
            setTimeout(checkStatus, 2000);
          }
        } catch (pollError) {
          Logger.App.error(
            "Failed to check story status during polling:",
            pollError
          );
          // apiClient interceptor should handle notifications for API errors during polling.
          // A custom notification here could be for non-API errors or specific UI feedback.
          // Example:
          // notificationService.addNotification({
          //   type: "warning",
          //   title: "Update",
          //   message: "Having trouble confirming story readiness. It might take a bit longer."
          // });
        }
      };
      checkStatus();

      setIsLoading(false); // Set loading false after initial success response and polling setup
      return storyData;
    } catch (error) {
      // This error is from storyApi.createStory, processed by apiClient interceptor
      handleError(error, localPlayerCodes);
      return undefined; // Indicate failure and that error was handled
    }
  };

  const createStoryFromTemplate = async (
    data: CreateStoryFromTemplateRequest
  ): Promise<CreateStoryInfo | undefined> => {
    setIsLoading(true);
    Logger.App.log("Starting template story creation process (new)");
    let localPlayerCodes: Record<string, string> | null = null;

    try {
      Logger.App.log("Sending createStoryFromTemplate request to server");
      const responseData = await storyApi.createStoryFromTemplate(data);
      localPlayerCodes = responseData.codes;

      Logger.App.log(
        "Received response from server. responseData: ",
        responseData
      );
      Logger.App.log(`Received story ID: ${responseData.storyId}`);
      setStoryId(responseData.storyId);
      setPlayerCodes(responseData.codes);

      if (responseData.status === "ready") {
        setStoryReady(true);
        Logger.App.log(
          `Template story ${responseData.storyId} is ready immediately.`
        );
      } else {
        // This case might be rare for templates if they are always 'ready'
        Logger.App.warn(
          `Template story ${responseData.storyId} has status ${responseData.status}. Polling...`
        );
        const checkStatus = async () => {
          try {
            Logger.App.log(
              `Checking status for story: ${responseData.storyId}`
            );
            const statusResult = await storyApi.checkStoryStatus(
              responseData.storyId
            );
            if (statusResult.status === "ready") {
              Logger.App.log(`Story ${responseData.storyId} is ready`);
              setStoryReady(true);
            } else {
              Logger.App.log(
                `Story ${responseData.storyId} is still queued, will check again in 2s`
              );
              setTimeout(checkStatus, 2000);
            }
          } catch (pollError) {
            Logger.App.error(
              "Failed to check story status for template during polling:",
              pollError
            );
            // apiClient interceptor should handle notifications.
          }
        };
        checkStatus();
      }
      setIsLoading(false);
      return responseData;
    } catch (error) {
      // This error is from storyApi.createStoryFromTemplate, processed by apiClient interceptor
      handleError(error, localPlayerCodes);
      return undefined; // Indicate failure and that error was handled
    }
  };

  const handleCodeSubmit = (code: string) => {
    Logger.App.log(`Submitting code: ${code}`);
    navigate(`/game/${code}`);
  };

  return {
    isLoading,
    storyId,
    playerCodes,
    storyReady,
    createStory,
    createStoryFromTemplate,
    handleCodeSubmit,
  };
}
