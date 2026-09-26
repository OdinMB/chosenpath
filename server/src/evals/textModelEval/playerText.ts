/*
 * A beat's text as the game shows it to the player. A copy of the client's
 * normalizeStoryText (client/src/game/utils/storyTextProcessor.ts), which
 * the server cannot import: a single newline starts a new paragraph, an image
 * line joins the paragraph after it (a trailing image the one before it), and
 * a line starting with a comma is a soft wrap. The checks and the rating
 * pages split paragraphs on this form, so they count and show what players
 * see. Keep it in step with the client function.
 */

export function playerStoryText(text: string): string {
  let result = text.normalize();
  // An image line starts a new paragraph
  result = result.replace(/\n(?!\n)(?=\s*\[image[^\]]*\])/g, "\n\n");
  // An image that starts a paragraph joins the text after it
  result = result.replace(/(^|\n\n)(\s*\[image[^\]]*\])\n(?!\n)/g, (_m, before: string, image: string) => `${before}${image} `);
  // A line starting with a comma is a soft wrap
  result = result.replace(/\n\s*,/g, " ,");
  // A trailing image joins the paragraph before it
  result = result.replace(/\n+\s*(\[image[^\]]*\])\s*$/g, " $1");
  result = result.replace(/\n{3,}/g, "\n\n");
  // Every remaining single newline is a paragraph break
  result = result.replace(/([^\n])\n([^\n])/g, "$1\n\n$2");
  return result;
}

/** The paragraphs a player sees, tags still in place. */
export function playerParagraphs(text: string): string[] {
  return playerStoryText(text)
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}
