/*
 * Machine-readable markers for the AI-generated text the app serves: a field
 * in the JSON that carries the text, and matching data attributes in the
 * reader's HTML. An interim measure while the text models offer no watermark.
 * It is neither a watermark nor the Code of Practice's marking layer
 * (.context/ai-transparency.md).
 */

/** IPTC digital source type for content generated entirely by an AI model. */
export const TRAINED_ALGORITHMIC_MEDIA =
  "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia";

export type AiContentProvenance = {
  aiGenerated: true;
  digitalSourceType: typeof TRAINED_ALGORITHMIC_MEDIA;
  /** The system that generated the content; never the user who asked for it. */
  generator: "Chosen Path";
};

export const AI_TEXT_PROVENANCE: AiContentProvenance = {
  aiGenerated: true,
  digitalSourceType: TRAINED_ALGORITHMIC_MEDIA,
  generator: "Chosen Path",
};
