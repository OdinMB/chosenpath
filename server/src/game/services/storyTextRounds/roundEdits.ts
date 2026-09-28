/*
 * Anchored text edits for the turn rounds' eval-only variants: each passage
 * must occur exactly once where it is edited, so a production prompt change
 * near an anchor fails the round's tests instead of silently leaving an edit
 * undone. Fix the anchor, not the prompt.
 */

/** The state part of a planner or beat prompt starts here (every story role's prompt). */
export const STATE_MARKER = "======= CURRENT GAME STATE =======";

function count(text: string, passage: string): number {
  return passage === "" ? 0 : text.split(passage).length - 1;
}

function mustBeOnce(label: string, text: string, passage: string): void {
  const n = count(text, passage);
  if (n !== 1) throw new Error(`${label}: "${passage.slice(0, 70)}" found ${n} times`);
}

/** The text with one passage replaced; the passage must occur exactly once. */
export function replaceOnce(label: string, text: string, passage: string, replacement: string): string {
  mustBeOnce(label, text, passage);
  const at = text.indexOf(passage);
  return text.slice(0, at) + replacement + text.slice(at + passage.length);
}

/** The text with everything from `from` up to, not including, `to` replaced; each must occur exactly once, in order. */
export function replaceUntil(label: string, text: string, from: string, to: string, replacement: string): string {
  mustBeOnce(label, text, from);
  mustBeOnce(label, text, to);
  const start = text.indexOf(from);
  const end = text.indexOf(to);
  if (end < start + from.length) throw new Error(`${label}: "${to.slice(0, 70)}" comes before "${from.slice(0, 70)}" ends`);
  return text.slice(0, start) + replacement + text.slice(end);
}

/** A prompt split at its state marker: the instructions before it, the state from it on. */
export function splitAtState(label: string, prompt: string): { instructions: string; state: string } {
  mustBeOnce(label, prompt, STATE_MARKER);
  const at = prompt.indexOf(STATE_MARKER);
  return { instructions: prompt.slice(0, at), state: prompt.slice(at) };
}

/** A short id from a title, as production's ids read ("Harnessing Community Support" -> "harnessing_community_support"). */
export function slugOf(title: string, fallback = "thread"): string {
  const slug = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48)
    .replace(/_+$/g, "");
  return slug || fallback;
}
