/**
 * Alt text for an image the AI made: beat images, covers and portraits
 * (owner's approved copy of 2026-09-25, CP-8). Captions stay unprefixed.
 */
export function aiGeneratedImageAlt(description: string | undefined): string {
  const trimmed = description?.trim();
  return trimmed ? `AI-generated image: ${trimmed}` : "AI-generated image";
}
