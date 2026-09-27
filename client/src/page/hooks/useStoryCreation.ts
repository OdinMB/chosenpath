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
import { useSession } from "../../shared/session/useSession";
import { pollStoryStatus } from "./storyStatusPolling";

/** The last creation request, so a failed setup can be tried again as sent. */
type CreationRequest =
  | { kind: "prompt"; data: CreateStoryRequest }
  | { kind: "template"; data: CreateStoryFromTemplateRequest };

export function useStoryCreation() {
  const navigate = useNavigate();
  const { refreshStoredCodeSets } = useSession();
  const [isLoading, setIsLoading] = useState(false);
  const [storyId, setStoryId] = useState<string | null>(null);
  const [playerCodes, setPlayerCodes] = useState<Record<string, string> | null>(
    null
  );
  const [storyReady, setStoryReady] = useState(false);
  // The setup failed for good: the screen shows the failure, not the codes
  const [setupFailed, setSetupFailed] = useState(false);
  const pollingStartTimeRef = useRef<number | null>(null);
  // Each attempt polls under its own number; a newer attempt (or leaving the
  // page) cancels the older poll
  const pollAttemptRef = useRef(0);
  const lastRequestRef = useRef<CreationRequest | null>(null);

  // Clear polling start time when component unmounts or when story becomes ready
  useEffect(() => {
    if (storyReady) {
      pollingStartTimeRef.current = null;
    }
  }, [storyReady]);

  // Stop polling when the component unmounts
  useEffect(() => {
    return () => {
      pollAttemptRef.current += 1;
    };
  }, []);

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

  /** Clears the last attempt (and stops its poll), back to the form. */
  const resetStoryCreation = () => {
    pollAttemptRef.current += 1;
    pollingStartTimeRef.current = null;
    setStoryId(null);
    setPlayerCodes(null);
    setStoryReady(false);
    setSetupFailed(false);
    setIsLoading(false);
  };

  /** Polls a queued story until it is ready or its setup failed for good. */
  const pollUntilReady = (storyData: CreateStoryInfo) => {
    const attempt = ++pollAttemptRef.current;
    const codes = Object.values(storyData.codes);
    Logger.App.log(
      `Story ${storyData.storyId} status is ${storyData.status}. Polling...`
    );
    void pollStoryStatus({
      check: () => storyApi.checkStoryStatus(storyData.storyId),
      schedule: (next, delayMs) => {
        Logger.App.log(
          `Story ${storyData.storyId} is not ready yet, will check again in ${
            delayMs / 1000
          }s`
        );
        setTimeout(next, delayMs);
      },
      delayFor: getPollingInterval,
      isCancelled: () => attempt !== pollAttemptRef.current,
      onReady: () => {
        Logger.App.log(`Story ${storyData.storyId} is ready`);
        setStoryReady(true);
        setIsLoading(false);
        pollingStartTimeRef.current = null;
      },
      onFailed: (reason) => {
        Logger.App.warn(
          `Setup of story ${storyData.storyId} failed (${reason})`
        );
        setSetupFailed(true);
        setIsLoading(false);
        pollingStartTimeRef.current = null;
        // The story never came to be, so its codes lead nowhere
        if (codes.length > 0) {
          removeCodeSetFromStorage(codes);
          refreshStoredCodeSets();
        }
      },
    });
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
      pollUntilReady(storyData);
    }
  };

  const createStory = async (
    data: CreateStoryRequest
  ): Promise<CreateStoryInfo | undefined> => {
    lastRequestRef.current = { kind: "prompt", data };
    setIsLoading(true);
    pollingStartTimeRef.current = null;
    Logger.App.log("Starting story creation process (prompt-based)");
    console.log('Story creation request data:', data);
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
    lastRequestRef.current = { kind: "template", data };
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
        // Template stories are created before the response; poll just in case
        pollUntilReady(responseData);
      }
      return responseData;
    } catch (error) {
      handleError(error, tempCodesForCleanup); // Pass the string[] for cleanup
      return undefined;
    }
  };

  /**
   * Sends the last request again (same premise or template, same settings).
   * It goes through the same checks as the first: a moderation refusal or a
   * rate limit shows its own notification and leaves the player on the form.
   */
  const retryStoryCreation = async (): Promise<CreateStoryInfo | undefined> => {
    const last = lastRequestRef.current;
    resetStoryCreation();
    if (!last) return undefined;
    Logger.App.log("Trying the story setup again");
    return last.kind === "prompt"
      ? createStory(last.data)
      : createStoryFromTemplate(last.data);
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
    setupFailed,
    createStory,
    createStoryFromTemplate,
    retryStoryCreation,
    resetStoryCreation,
    handleCodeSubmit,
  };
}
