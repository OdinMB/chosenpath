import { useState, useEffect, useRef, useCallback } from "react";
import { SessionContext, StoredCodeSet } from "./SessionContext.js";
import {
  getStoredCodeSets,
  deleteStoredCodeSet,
} from "./utils/codeSetUtils.js";

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
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

  const value = {
    sessionId,
    setSessionId,
    isLoading,
    setIsLoading,
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
