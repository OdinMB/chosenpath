import { useState, useEffect, useRef, useCallback } from "react";
import type { RateLimitInfo, ContentModerationInfo } from "core/types";
import { SessionContext, StoredCodeSet } from "./SessionContext.js";
import {
  getStoredCodeSets,
  deleteStoredCodeSet,
} from "./utils/codeSetUtils.js";

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rateLimit, setRateLimit] = useState<RateLimitInfo | null>(null);
  const [contentModeration, setContentModeration] =
    useState<ContentModerationInfo | null>(null);
  const [storyReady, setStoryReady] = useState(false);
  const [storedCodeSets, setStoredCodeSets] = useState<StoredCodeSet[]>(
    getStoredCodeSets()
  );

  // Use refs to track states without causing effect reruns
  const isLoadingRef = useRef(isLoading);

  // Keep the refs updated with the latest values
  useEffect(() => {
    isLoadingRef.current = isLoading;
  }, [isLoading]);

  // Function to update the storedCodeSets state after changes
  const refreshStoredCodeSets = useCallback(() => {
    setStoredCodeSets(getStoredCodeSets());
  }, []);

  useEffect(() => {
    if (rateLimit && rateLimit.timeRemaining > 0) {
      const timer = setTimeout(() => {
        setRateLimit(null);
      }, rateLimit.timeRemaining);

      return () => clearTimeout(timer);
    }
  }, [rateLimit]);

  const value = {
    sessionId,
    setSessionId,
    isLoading,
    setIsLoading,
    storyReady,
    setStoryReady,
    error,
    setError,
    rateLimit,
    setRateLimit,
    contentModeration,
    setContentModeration,
    storedCodeSets,
    refreshStoredCodeSets,
    deleteCodeSet: (timestamp: number) => {
      deleteStoredCodeSet(timestamp);
      refreshStoredCodeSets();
    },
  };

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}
