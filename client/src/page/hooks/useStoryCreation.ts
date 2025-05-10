import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Logger } from "shared/logger";
import { storyApi } from "shared/apiClient";
import {
  CreateStoryRequest,
  CreateStoryFromTemplateRequest,
} from "core/types/api";

export function useStoryCreation() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [storyId, setStoryId] = useState<string | null>(null);
  const [playerCodes, setPlayerCodes] = useState<Record<string, string> | null>(
    null
  );
  const [storyReady, setStoryReady] = useState(false);

  const createStory = async (data: CreateStoryRequest) => {
    setIsLoading(true);
    Logger.App.log("Starting story creation process");

    try {
      Logger.App.log("Sending createStory request to server");
      const response = await storyApi.createStory(data);
      Logger.App.log(`Received story ID: ${response.data.storyId}`);

      setStoryId(response.data.storyId);
      setPlayerCodes(response.data.codes);
      Logger.App.log("Received player codes, starting status polling");

      // Start polling for story status
      const checkStatus = async () => {
        try {
          Logger.App.log(`Checking status for story: ${response.data.storyId}`);
          const status = await storyApi.checkStoryStatus(response.data.storyId);
          if (status.data.status === "ready") {
            Logger.App.log(`Story ${response.data.storyId} is ready`);
            setStoryReady(true);
          } else {
            Logger.App.log(
              `Story ${response.data.storyId} is still queued, will check again in 2s`
            );
            // Check again in 2 seconds
            setTimeout(checkStatus, 2000);
          }
        } catch (error) {
          Logger.App.error("Failed to check story status:", error);
        }
      };
      checkStatus();

      return {
        storyId: response.data.storyId,
        codes: response.data.codes,
      };
    } catch (error) {
      Logger.App.error("Failed to create story:", error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const createStoryFromTemplate = async (
    data: CreateStoryFromTemplateRequest
  ) => {
    setIsLoading(true);
    Logger.App.log("Starting template story creation process");

    try {
      Logger.App.log("Sending createStoryFromTemplate request to server");
      const response = await storyApi.createStoryFromTemplate(data);
      Logger.App.log(`Received story ID: ${response.data.storyId}`);

      setStoryId(response.data.storyId);
      setPlayerCodes(response.data.codes);
      Logger.App.log("Received player codes, starting status polling");

      // Start polling for story status
      const checkStatus = async () => {
        try {
          Logger.App.log(`Checking status for story: ${response.data.storyId}`);
          const status = await storyApi.checkStoryStatus(response.data.storyId);
          if (status.data.status === "ready") {
            Logger.App.log(`Story ${response.data.storyId} is ready`);
            setStoryReady(true);
          } else {
            Logger.App.log(
              `Story ${response.data.storyId} is still queued, will check again in 2s`
            );
            // Check again in 2 seconds
            setTimeout(checkStatus, 2000);
          }
        } catch (error) {
          Logger.App.error("Failed to check story status:", error);
        }
      };
      checkStatus();

      return {
        storyId: response.data.storyId,
        codes: response.data.codes,
      };
    } catch (error) {
      Logger.App.error("Failed to create story from template:", error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const handleCodeSubmit = (code: string) => {
    Logger.App.log(`Submitting code: ${code}`);
    // Navigate to the game with the code
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
