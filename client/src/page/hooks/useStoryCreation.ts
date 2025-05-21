import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Logger } from "shared/logger";
import { storyApi } from "shared/apiClient";
import {
  CreateStoryRequest,
  CreateStoryFromTemplateRequest,
  CreateStoryInfo,
} from "core/types/api";
import {
  addCodeSetToStorage,
  removeCodeSetFromStorage,
} from "../../shared/utils/codeSetUtils";
import { useSession } from "../../shared/useSession";

export function useStoryCreation() {
  const navigate = useNavigate();
  const { refreshStoredCodeSets } = useSession();
  const [isLoading, setIsLoading] = useState(false);
  const [storyId, setStoryId] = useState<string | null>(null);
  const [playerCodes, setPlayerCodes] = useState<Record<string, string> | null>(
    null
  );
  const [storyReady, setStoryReady] = useState(false);
  const pollingStartTimeRef = useRef<number | null>(null);

  // Clear polling start time when component unmounts or when story becomes ready
  useEffect(() => {
    if (storyReady) {
      pollingStartTimeRef.current = null;
    }
  }, [storyReady]);

  const getPollingInterval = () => {
    if (pollingStartTimeRef.current === null) {
      pollingStartTimeRef.current = Date.now();
      return 10000; // Start with 10 seconds
    }

    const elapsedTime = Date.now() - pollingStartTimeRef.current;
    const elapsedSeconds = Math.floor(elapsedTime / 1000);

    if (elapsedSeconds <= 30) {
      return 10000; // 0-30 seconds: poll every 10 seconds
    } else if (elapsedSeconds <= 60) {
      return 5000; // 31-50 seconds: poll every 5 seconds
    } else {
      return 2000; // >50 seconds: poll every 2 seconds
    }
  };

  const handleError = (error: unknown, codesToDelete?: string[] | null) => {
    Logger.App.error("Story creation process failed:", error);
    setIsLoading(false);
    pollingStartTimeRef.current = null;

    if (codesToDelete && codesToDelete.length > 0) {
      removeCodeSetFromStorage(codesToDelete);
      Logger.App.log(
        "Attempted to delete local player codeset on error.",
        codesToDelete
      );
      refreshStoredCodeSets();
    }
    // Navigation on error is commented out as it might be too disruptive
    // navigate("/");
    // Logger.App.log("Redirected to / after story creation failure.");
  };

  // This is the common success handler used by createStory (prompt-based)
  // createStoryFromTemplate now has its own explicit logic as per user revert.
  const handleStoryDataResponse = (storyData: CreateStoryInfo) => {
    Logger.App.log(`Received story ID: ${storyData.storyId}`);
    setStoryId(storyData.storyId);
    setPlayerCodes(storyData.codes);

    const codesArray = Object.values(storyData.codes);
    if (codesArray.length > 0) {
      addCodeSetToStorage(codesArray);
      refreshStoredCodeSets();
      Logger.App.log(
        "Stored new player code set locally (prompt-based):",
        codesArray
      );
    }

    if (storyData.status === "ready") {
      Logger.App.log(`Story ${storyData.storyId} is ready immediately.`);
      setStoryReady(true);
      setIsLoading(false);
      pollingStartTimeRef.current = null;
    } else {
      Logger.App.log(
        `Story ${storyData.storyId} status is ${storyData.status}. Polling...`
      );
      const checkStatus = async () => {
        try {
          Logger.App.log(`Polling status for story: ${storyData.storyId}`);
          const statusResult = await storyApi.checkStoryStatus(
            storyData.storyId
          );
          if (statusResult.status === "ready") {
            Logger.App.log(`Story ${storyData.storyId} is ready`);
            setStoryReady(true);
            setIsLoading(false);
            pollingStartTimeRef.current = null;
          } else {
            const interval = getPollingInterval();
            Logger.App.log(
              `Story ${storyData.storyId} is still ${
                statusResult.status
              }, will check again in ${interval / 1000}s`
            );
            if (!storyReady) {
              setTimeout(checkStatus, interval);
            }
          }
        } catch (pollError) {
          Logger.App.error(
            `Failed to poll story status for ${storyData.storyId}:`,
            pollError
          );
          setIsLoading(false);
          pollingStartTimeRef.current = null;
        }
      };
      if (!storyReady) {
        checkStatus();
      }
    }
  };

  const createStory = async (
    data: CreateStoryRequest
  ): Promise<CreateStoryInfo | undefined> => {
    setIsLoading(true);
    pollingStartTimeRef.current = null;
    Logger.App.log("Starting story creation process (prompt-based)");
    let tempCodesForCleanup: string[] | null = null;

    try {
      Logger.App.log("Sending createStory request to server");
      const storyData = await storyApi.createStory(data);
      tempCodesForCleanup = Object.values(storyData.codes);
      handleStoryDataResponse(storyData); // Uses the common handler
      return storyData;
    } catch (error) {
      handleError(error, tempCodesForCleanup);
      return undefined;
    }
  };

  const createStoryFromTemplate = async (
    data: CreateStoryFromTemplateRequest
  ): Promise<CreateStoryInfo | undefined> => {
    setIsLoading(true);
    pollingStartTimeRef.current = null;
    Logger.App.log("Starting template story creation process (template-based)");
    // Correctly declare codesForPotentialCleanup for this function's scope
    let tempCodesForCleanup: string[] | null = null;

    try {
      Logger.App.log("Sending createStoryFromTemplate request to server");
      const responseData = await storyApi.createStoryFromTemplate(data);

      // Store codes from API response
      const apiReturnedPlayerCodes = responseData.codes; // Record<string, string>
      tempCodesForCleanup = Object.values(apiReturnedPlayerCodes); // string[] for cleanup

      Logger.App.log(
        "Received response from server for template. responseData: ",
        responseData
      );
      Logger.App.log(`Received story ID: ${responseData.storyId}`);
      setStoryId(responseData.storyId);
      setPlayerCodes(apiReturnedPlayerCodes); // Set state with Record<string, string>

      // Add codes to local storage
      if (tempCodesForCleanup.length > 0) {
        addCodeSetToStorage(tempCodesForCleanup);
        refreshStoredCodeSets();
        Logger.App.log(
          "Stored new player code set locally (from template):",
          tempCodesForCleanup
        );
      }

      if (responseData.status === "ready") {
        setStoryReady(true);
        Logger.App.log(
          `Template story ${responseData.storyId} is ready immediately.`
        );
        setIsLoading(false); // Stop loading if ready
        pollingStartTimeRef.current = null;
      } else {
        Logger.App.warn(
          `Template story ${responseData.storyId} has status ${responseData.status}. Polling...`
        );
        const checkStatus = async () => {
          try {
            Logger.App.log(
              `Polling status for template story: ${responseData.storyId}`
            );
            const statusResult = await storyApi.checkStoryStatus(
              responseData.storyId
            );
            if (statusResult.status === "ready") {
              Logger.App.log(`Template story ${responseData.storyId} is ready`);
              setStoryReady(true);
              setIsLoading(false); // Stop loading once polling confirms ready
              pollingStartTimeRef.current = null;
            } else {
              const interval = getPollingInterval();
              Logger.App.log(
                `Template story ${responseData.storyId} is still ${
                  statusResult.status
                }, will check again in ${interval / 1000}s`
              );
              if (!storyReady) {
                // Continue polling only if not ready
                setTimeout(checkStatus, interval);
              }
            }
          } catch (pollError) {
            Logger.App.error(
              "Failed to poll story status for template during polling:",
              pollError
            );
            setIsLoading(false); // Stop loading on polling error
            pollingStartTimeRef.current = null;
          }
        };
        if (!storyReady) {
          // Start polling if not immediately ready
          checkStatus();
        }
      }
      return responseData;
    } catch (error) {
      handleError(error, tempCodesForCleanup); // Pass the string[] for cleanup
      return undefined;
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
