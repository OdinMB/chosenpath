/*
 * Decides which rater-visible text would reveal or prime a model identity.
 * Case selection skips cases that match, and the rating-file validator rejects
 * any string that matches, so the owner's rating stays blind.
 *
 * A bare "gpt" is deliberately not matched (too easy to hit inside ordinary
 * words); the NPC "Sora" and "lens flare" in style notes are matched on purpose.
 */
export const LEAK_PATTERN =
  /gpt[-_ ]?\d|gpt-image|chatgpt|dall-?e|\bflare\b|sunburst|\bsora\b|image-[12]/i;

export function containsLeak(text: string): boolean {
  return LEAK_PATTERN.test(text);
}

/** Every string anywhere inside a JSON-like value that matches the pattern. */
export function findLeaks(value: unknown): string[] {
  if (typeof value === "string") {
    return containsLeak(value) ? [value] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry) => findLeaks(entry));
  }
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, entry]) => [
      ...findLeaks(key),
      ...findLeaks(entry),
    ]);
  }
  return [];
}
