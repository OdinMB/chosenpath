import { AI_TEXT_PROVENANCE } from "core/types";

/*
 * Invisible HTML data attributes that mark AI-generated story text for
 * machines (scrapers, archivers, browser tools). An interim measure while the
 * text models offer no watermark; neither a watermark nor the Code of
 * Practice's marking layer (.context/ai-transparency.md).
 */
export const AI_GENERATED_TEXT_ATTRIBUTES = {
  "data-ai-generated": "true",
  "data-digital-source-type": AI_TEXT_PROVENANCE.digitalSourceType,
} as const;
