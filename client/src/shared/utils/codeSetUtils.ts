import { Logger } from "../logger.js";
import { API_CONFIG } from "../../config"; // Import API_CONFIG

const LOCAL_STORAGE_KEY = "playerCodeSets";
const logger = Logger.App; // Changed from Logger.Util to Logger.App

/**
 * Retrieves all stored code sets (array of string arrays) from localStorage.
 * @returns {string[][]} An array of code sets, or an empty array if none found or on error.
 */
export function getStoredCodeSets(): string[][] {
  try {
    const setsJSON = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!setsJSON) {
      return [];
    }
    const sets = JSON.parse(setsJSON);
    if (
      Array.isArray(sets) &&
      sets.every(
        (set) =>
          Array.isArray(set) && set.every((code) => typeof code === "string")
      )
    ) {
      return sets;
    }
    logger.warn(
      "Invalid data structure found in localStorage for playerCodeSets_v2. Returning empty array and clearing invalid data."
    );
    localStorage.removeItem(LOCAL_STORAGE_KEY); // Clear invalid data
    return [];
  } catch (error) {
    logger.error("Error getting stored code sets from localStorage", error);
    return [];
  }
}

/**
 * Saves the list of all code sets to localStorage.
 * @param {string[][]} codeSets - The complete list of code sets to save.
 */
function saveCodeSetsToStorage(codeSets: string[][]): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(codeSets));
  } catch (error) {
    logger.error("Error saving code sets to localStorage", error);
  }
}

/**
 * Compares two string arrays for equality, ignoring order.
 * @param {string[]} arr1
 * @param {string[]} arr2
 * @returns {boolean} True if the arrays contain the same strings.
 */
function areCodeSetsIdentical(arr1: string[], arr2: string[]): boolean {
  if (arr1.length !== arr2.length) {
    return false;
  }
  const sortedArr1 = [...arr1].sort();
  const sortedArr2 = [...arr2].sort();
  return sortedArr1.every((value, index) => value === sortedArr2[index]);
}

/**
 * Adds a new code set (array of strings) to localStorage if an identical set doesn't already exist.
 * @param {string[]} newCodeSet - The new code set to add (e.g., ["CODE1", "CODE2"] or ["SINGLE_CODE"]).
 */
export function addCodeSetToStorage(newCodeSet: string[]): void {
  if (
    !newCodeSet ||
    newCodeSet.length === 0 ||
    !newCodeSet.every((code) => typeof code === "string" && code.trim() !== "")
  ) {
    logger.warn(
      "Attempted to store an empty, invalid, or non-string code set:",
      newCodeSet
    );
    return;
  }

  const existingCodeSets = getStoredCodeSets();
  const alreadyExists = existingCodeSets.some((existingSet) =>
    areCodeSetsIdentical(existingSet, newCodeSet)
  );

  if (alreadyExists) {
    logger.log(
      "Code set already exists in storage, not adding again:",
      newCodeSet
    );
    return;
  }

  existingCodeSets.push(newCodeSet);
  saveCodeSetsToStorage(existingCodeSets);
  logger.log(
    "Added new code set to storage:",
    newCodeSet,
    "Total sets:",
    existingCodeSets.length
  );
}

/**
 * Removes a specific code set from localStorage.
 * @param {string[]} codeSetToRemove - The code set to remove.
 */
export function removeCodeSetFromStorage(codeSetToRemove: string[]): void {
  if (
    !codeSetToRemove ||
    codeSetToRemove.length === 0 ||
    !codeSetToRemove.every((code) => typeof code === "string")
  ) {
    logger.warn(
      "Attempted to remove an empty or invalid code set:",
      codeSetToRemove
    );
    return;
  }
  const existingCodeSets = getStoredCodeSets();
  const filteredSets = existingCodeSets.filter(
    (existingSet) => !areCodeSetsIdentical(existingSet, codeSetToRemove)
  );

  if (filteredSets.length === existingCodeSets.length) {
    logger.warn("Code set to remove not found in storage:", codeSetToRemove);
  } else {
    saveCodeSetsToStorage(filteredSets);
    logger.log(
      "Removed code set from storage:",
      codeSetToRemove,
      "Remaining sets:",
      filteredSets.length
    );
  }
}

/**
 * Retrieves all unique player codes from all stored sets.
 * @returns {string[]} A flat array of unique player codes.
 */
export function getAllUniqueCodesFromStorage(): string[] {
  const allSets = getStoredCodeSets();
  const allCodes: string[] = [];
  allSets.forEach((set) => {
    if (Array.isArray(set)) {
      // Ensure the set itself is an array
      set.forEach((code) => {
        if (typeof code === "string") {
          // Ensure each code is a string
          allCodes.push(code);
        }
      });
    }
  });
  return Array.from(new Set(allCodes)); // Deduplicate
}

/**
 * Check if there are any stored code sets.
 * @returns {boolean} Boolean indicating whether there are any stored code sets.
 */
export function hasStoredCodeSets(): boolean {
  return getStoredCodeSets().length > 0;
}

/**
 * Generate a shareable join link for a code.
 * @param {string} code - The player code to create a link for.
 * @returns {string} A complete URL that can be shared for direct joining.
 */
export function generateJoinLink(code: string): string {
  let baseUrl = "";
  // DEFAULT_CORS_ORIGIN can be string[] or string.
  if (Array.isArray(API_CONFIG.DEFAULT_CORS_ORIGIN)) {
    baseUrl = API_CONFIG.DEFAULT_CORS_ORIGIN[0]; // Use the first one if it's an array
  } else {
    baseUrl = API_CONFIG.DEFAULT_CORS_ORIGIN;
  }

  // Ensure baseUrl has a protocol, default to https if not present and not localhost
  if (!baseUrl.startsWith("http://") && !baseUrl.startsWith("https://")) {
    if (baseUrl.includes("localhost") || baseUrl.includes("127.0.0.1")) {
      baseUrl = "http://" + baseUrl;
    } else {
      baseUrl = "https://" + baseUrl;
    }
  }

  // Remove trailing slash if present, before appending /game/:code
  if (baseUrl.endsWith("/")) {
    baseUrl = baseUrl.slice(0, -1);
  }

  return `${baseUrl}/game/${code}`;
}
