import { StoredCodeSet } from "../SessionContext.js";
import { Logger } from "../logger.js";
import { API_CONFIG } from "core/config";

// Create a dedicated logger for code set operations
const logger = Logger.UI;

/**
 * Stores a code set in localStorage
 * @param codes - The player codes to store
 * @param title - Optional title for the code set
 * @param lastActive - Whether this is the currently active code set
 */
export function storeCodeSet(
  codes: Record<string, string>,
  title?: string,
  lastActive?: boolean
): void {
  try {
    const codeSet: StoredCodeSet = {
      codes,
      timestamp: Date.now(),
      title,
      lastActive: lastActive || false,
    };

    // Get existing code sets
    const existingSets = getStoredCodeSets();

    // Add new code set
    existingSets.push(codeSet);
    logger.log("Adding new code set. Total sets:", existingSets.length);

    // Save back to localStorage
    localStorage.setItem("storyCodes", JSON.stringify(existingSets));
    return;
  } catch (error) {
    logger.error("Error storing code set in localStorage", error);
  }
}

/**
 * Get all stored code sets from localStorage
 * @returns Array of code sets stored in localStorage
 */
export function getStoredCodeSets(): StoredCodeSet[] {
  try {
    const setsJSON = localStorage.getItem("storyCodes");
    if (!setsJSON) return [];

    const sets = JSON.parse(setsJSON);
    return Array.isArray(sets) ? sets : [];
  } catch (error) {
    logger.error("Error getting stored code sets", error);
    return [];
  }
}

/**
 * Check if there are any stored code sets
 * @returns Boolean indicating whether there are any stored code sets
 */
export function hasCodeSets(): boolean {
  return getStoredCodeSets().length > 0;
}

/**
 * Gets code sets sorted by activity status and timestamp
 * @returns Array of code sets sorted with active sets first, then by newest first
 */
export function getSortedCodeSets(): StoredCodeSet[] {
  return [...getStoredCodeSets()].sort((a, b) => {
    // First priority: lastActive flag
    if (a.lastActive && !b.lastActive) return -1;
    if (!a.lastActive && b.lastActive) return 1;

    // Second priority: timestamp (newest first)
    return b.timestamp - a.timestamp;
  });
}

/**
 * Delete a code set by timestamp
 * @param timestamp - The timestamp of the code set to delete
 * @returns True if a code set was deleted, false otherwise
 */
export function deleteStoredCodeSet(timestamp: number): boolean {
  try {
    const sets = getStoredCodeSets();
    const originalLength = sets.length;
    const filteredSets = sets.filter((set) => set.timestamp !== timestamp);

    if (filteredSets.length === originalLength) {
      logger.warn("No code set found with timestamp:", timestamp);
      return false;
    }

    localStorage.setItem("storyCodes", JSON.stringify(filteredSets));
    logger.log(
      "Successfully deleted code set. Remaining sets:",
      filteredSets.length
    );
    return true;
  } catch (error) {
    logger.error("Error deleting code set", error);
    return false;
  }
}

/**
 * Find and delete code sets matching a specific set of codes
 * @param codes - The codes to match against
 * @returns Number of code sets deleted
 */
export function deleteCodeSetsByContent(codes: Record<string, string>): number {
  try {
    const sets = getStoredCodeSets();
    let deletedCount = 0;

    // Find matching sets
    const matchingSets = sets.filter((set) => {
      const setCodeValues = Object.values(set.codes);
      const targetCodeValues = Object.values(codes);

      return (
        setCodeValues.length === targetCodeValues.length &&
        targetCodeValues.every((code) => setCodeValues.includes(code))
      );
    });

    if (matchingSets.length === 0) return 0;

    // Delete each matching set
    matchingSets.forEach((set) => {
      if (deleteStoredCodeSet(set.timestamp)) {
        deletedCount++;
      }
    });

    return deletedCount;
  } catch (error) {
    logger.error("Error deleting code sets by content", error);
    return 0;
  }
}

/**
 * Update a stored set with a new code or create a new set if not found
 * @param code - The player code
 * @param playerRole - The role of the player (e.g., "player1")
 * @param title - Optional title for the code set
 * @param lastActive - Whether this is the active code set
 */
export function updateStoredSetWithCode(
  code: string,
  playerRole: string,
  title?: string,
  lastActive?: boolean
): void {
  try {
    const sets = getStoredCodeSets();

    // Find if any set contains this code
    const existingSetIndex = sets.findIndex((set) =>
      Object.values(set.codes).includes(code)
    );

    if (existingSetIndex >= 0) {
      // Update existing set
      sets[existingSetIndex].codes[playerRole] = code;

      // Update title if provided and not already set
      if (title && !sets[existingSetIndex].title) {
        sets[existingSetIndex].title = title;
      }

      // Update active status if specified
      if (lastActive !== undefined) {
        sets[existingSetIndex].lastActive = lastActive;

        // If this set is now active, make other sets inactive
        if (lastActive) {
          sets.forEach((set, i) => {
            if (i !== existingSetIndex) set.lastActive = false;
          });
        }
      }
    } else {
      // Create new set if code not found
      sets.push({
        codes: { [playerRole]: code },
        timestamp: Date.now(),
        title,
        lastActive: lastActive || false,
      });
    }

    localStorage.setItem("storyCodes", JSON.stringify(sets));
    logger.log("Updated code set for", code);
  } catch (error) {
    logger.error("Error updating stored code", error);
  }
}

/**
 * Generate a shareable join link for a code
 * @param code - The player code to create a link for
 * @returns A complete URL that can be shared for direct joining
 */
export function generateJoinLink(code: string): string {
  // Create URL with the domain and code
  const domain = API_CONFIG.DEFAULT_CORS_ORIGIN;

  return `${domain}/join/${code}`;
}
