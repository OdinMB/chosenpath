import { useContext } from "react";
import { SessionContext } from "../contexts/SessionContext.js";

export function useSession() {
  return useContext(SessionContext);
} 