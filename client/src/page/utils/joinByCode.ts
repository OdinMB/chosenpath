/*
 * The home page's join form: a seat code a student scans or types, checked
 * against the server before the game page opens, so a mistyped code is told
 * on the spot instead of on an empty game page.
 */

/**
 * Whether the text has a story code's shape: exactly 6 letters A–Z or digits.
 * NOTE: This must match code generation in server/src/stories/StoryCreationService.ts (generatePlayerCodes)
 */
export function isStoryCodeFormat(inputCode: string): boolean {
  const trimmedCode = inputCode.trim();
  return trimmedCode.length === 6 && /^[A-Z0-9]+$/.test(trimmedCode);
}

export const CODE_FORMAT_PROBLEM =
  "Code must be exactly 6 characters and contain only letters and numbers";
export const CODE_NOT_FOUND =
  "Story code not found. Please check the code and try again.";
export const CODE_CHECK_FAILED = "Unable to validate code. Please try again.";

export type JoinOutcome =
  | { kind: "empty" }
  | { kind: "open"; path: string }
  | { kind: "problem"; message: string };

/**
 * Where a submitted code leads: the game page of a code that names a story,
 * else the line to show under the field. A malformed code is never sent; a
 * failed check (a limit, an outage) reads as one, with the API client's pop-up.
 */
export async function joinByCode(
  rawCode: string,
  checkCodeExists: (code: string) => Promise<boolean>
): Promise<JoinOutcome> {
  const code = rawCode.trim();
  if (!code) return { kind: "empty" };
  if (!isStoryCodeFormat(code)) {
    return { kind: "problem", message: CODE_FORMAT_PROBLEM };
  }
  try {
    return (await checkCodeExists(code))
      ? { kind: "open", path: `/game/${code}` }
      : { kind: "problem", message: CODE_NOT_FOUND };
  } catch {
    return { kind: "problem", message: CODE_CHECK_FAILED };
  }
}
