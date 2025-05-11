import { LoaderFunction } from "react-router-dom";
import { Logger } from "shared/logger";

/**
 * Loader for the /join/:code route
 * Stores the code in localStorage and passes it to the component
 */
export const codeJoinLoader: LoaderFunction = async ({ params }) => {
  const code = params.code;

  if (!code) {
    Logger.App.log("No code provided in URL, redirecting to home");
    // We'll handle this case in the component
    return null;
  }

  Logger.App.log(`Join code found in URL: ${code}`);

  // Generate a unique tabId if it doesn't exist
  const tabId =
    sessionStorage.getItem("tabId") ||
    Math.random().toString(36).substring(2, 15);

  // Store tabId in sessionStorage
  sessionStorage.setItem("tabId", tabId);

  // Return the code to the component
  return { code };
};
