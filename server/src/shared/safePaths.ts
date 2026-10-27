/**
 * Validates that path parameters don't contain directory traversal sequences
 * @param paths Path strings to validate (anything else counts as unsafe)
 * @returns true if all paths are safe, false otherwise
 */
export function validateSafePaths(...paths: unknown[]): boolean {
  // Only check for dangerous patterns, not regular path separators
  // The filePath parameter is expected to contain forward slashes for subdirectories
  return paths.every((pathParam) => {
    if (!pathParam || typeof pathParam !== "string") return false;

    // Check for directory traversal attempts
    if (pathParam.includes("..")) return false;

    // Check for backslashes (Windows path separators that shouldn't be in URLs)
    if (pathParam.includes("\\")) return false;

    // Check for absolute paths (starting with /)
    if (pathParam.startsWith("/")) return false;

    return true;
  });
}
