import { useContext } from "react";
import { SessionContext } from "./SessionContext.js";

export function useSession() {
  return useContext(SessionContext);
}
