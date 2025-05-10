import { useContext } from "react";
import {
  GameSessionContext,
  GameSessionContextType,
} from "./GameSessionContext";

/**
 * Hook to use the game session context
 * @returns The GameSession context
 * @throws Error if used outside of a GameSessionProvider
 */
export function useGameSession(): GameSessionContextType {
  const context = useContext(GameSessionContext);
  if (!context) {
    throw new Error("useGameSession must be used within a GameSessionProvider");
  }
  return context;
}
