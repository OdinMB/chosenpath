/*
 * The seat-card page's title. People save the cards as a PDF through the
 * browser's print dialog, which names the file after the page's title, so the
 * title carries the date and the stories' name: "2026-10-27 Seat cards - The
 * Lighthouse".
 */

/** Room for a story's title, so the whole title stays a usable file name. */
const MAX_STORY_TITLE_LENGTH = 80;

/** What Windows, macOS or Linux refuse in a file name, besides control characters. */
const NOT_IN_FILE_NAMES = new Set('<>:"/\\|?*');

function isControlCharacter(character: string): boolean {
  const code = character.charCodeAt(0);
  return code < 32 || code === 127;
}

/** The local calendar date as YYYY-MM-DD. */
function localDate(now: Date): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * Text without the characters Windows, macOS or Linux refuse in a file name
 * (and control characters), with spaces collapsed and no trailing dots, which
 * Windows drops.
 */
function fileNameSafe(text: string): string {
  return [...text]
    .map((character) =>
      NOT_IN_FILE_NAMES.has(character) || isControlCharacter(character)
        ? " "
        : character
    )
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.\s]+$/, "");
}

/**
 * The stories' name: their shared title, or the first one and how many other
 * titles there are. Titles come in card order, so the first is Story 1's.
 */
function storiesLabel(titles: string[]): string {
  const distinct = [...new Set(titles.map(fileNameSafe).filter(Boolean))];
  if (distinct.length === 0) return "";
  const first = distinct[0].slice(0, MAX_STORY_TITLE_LENGTH).trim();
  return distinct.length === 1 ? first : `${first} and ${distinct.length - 1} more`;
}

/** The page's title for the cards of these story titles, as of `now`. */
export function seatCardsDocumentTitle(titles: string[], now: Date): string {
  const label = storiesLabel(titles);
  const base = `${localDate(now)} Seat cards`;
  return label ? `${base} - ${label}` : base;
}
