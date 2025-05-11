import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Logger } from "shared/logger";
import { storyApi } from "shared/apiClient";
import {
  CreateStoryRequest,
  CreateStoryFromTemplateRequest,
  CreateStoryInfo,
} from "core/types/api";

export function useStoryCreation() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [storyId, setStoryId] = useState<string | null>(null);
  const [playerCodes, setPlayerCodes] = useState<Record<string, string> | null>(
    null
  );
  const [storyReady, setStoryReady] = useState(false);

  const createStory = async (
    data: CreateStoryRequest
  ): Promise<CreateStoryInfo> => {
    setIsLoading(true);
    Logger.App.log("Starting story creation process");

    try {
      Logger.App.log("Sending createStory request to server");
      const storyData = (await storyApi.createStory(data)) as CreateStoryInfo;

      Logger.App.log(`Received story ID: ${storyData.storyId}`);

      setStoryId(storyData.storyId);
      setPlayerCodes(storyData.codes);
      Logger.App.log("Received player codes, starting status polling");

      // Start polling for story status
      const checkStatus = async () => {
        try {
          Logger.App.log(`Checking status for story: ${storyData.storyId}`);
          const status = await storyApi.checkStoryStatus(storyData.storyId);
          if (status.status === "ready") {
            Logger.App.log(`Story ${storyData.storyId} is ready`);
            setStoryReady(true);
          } else {
            Logger.App.log(
              `Story ${storyData.storyId} is still queued, will check again in 2s`
            );
            setTimeout(checkStatus, 2000);
          }
        } catch (error) {
          Logger.App.error("Failed to check story status:", error);
        }
      };
      checkStatus();

      return storyData;
    } catch (error) {
      Logger.App.error("Failed to create story:", error);
      throw error; // Let the centralized error handler deal with it
    } finally {
      setIsLoading(false);
    }
  };

  const createStoryFromTemplate = async (
    data: CreateStoryFromTemplateRequest
  ): Promise<CreateStoryInfo> => {
    setIsLoading(true);
    Logger.App.log("Starting template story creation process");

    try {
      Logger.App.log("Sending createStoryFromTemplate request to server");
      const response = await storyApi.createStoryFromTemplate(data);
      Logger.App.log("Received response from server. responseData: ", response);

      Logger.App.log(`Received story ID: ${response.storyId}`);

      setStoryId(response.storyId);
      setPlayerCodes(response.codes);
      Logger.App.log("Received player codes, starting status polling");

      // Start polling for story status
      const checkStatus = async () => {
        try {
          Logger.App.log(`Checking status for story: ${response.storyId}`);
          const status = await storyApi.checkStoryStatus(response.storyId);
          if (status.status === "ready") {
            Logger.App.log(`Story ${response.storyId} is ready`);
            setStoryReady(true);
          } else {
            Logger.App.log(
              `Story ${response.storyId} is still queued, will check again in 2s`
            );
            setTimeout(checkStatus, 2000);
          }
        } catch (error) {
          Logger.App.error("Failed to check story status:", error);
        }
      };
      checkStatus();

      return response;
    } catch (error) {
      Logger.App.error("Failed to create story from template:", error);
      throw error; // Let the centralized error handler deal with it
    } finally {
      setIsLoading(false);
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
