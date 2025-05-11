import { createContext } from "react";

export type StoredCodeSet = {
  codes: Record<string, string>;
  timestamp: number;
  title?: string;
  lastActive: boolean;
};

export type SessionContextType = {
  sessionId: string | null;
  setSessionId: (id: string | null) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  // Stored code sets
  storedCodeSets: StoredCodeSet[];
  refreshStoredCodeSets: () => void;
  deleteCodeSet: (timestamp: number) => void;
};

export const SessionContext = createContext<SessionContextType>({
  sessionId: null,
  setSessionId: () => {},
  isLoading: false,
  setIsLoading: () => {},
  storedCodeSets: [],
  refreshStoredCodeSets: () => {},
  deleteCodeSet: () => {},
});
