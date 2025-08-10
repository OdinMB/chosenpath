import React from "react";
import { ImagePlaceholder, ClientStoryState, ImageUI } from "core/types";
import {
  IMAGE_PLACEHOLDER_REGEX,
  parseImagePlaceholder,
  createImageFromPlaceholder,
} from "shared/utils/imageUtils";
import { StoryImage } from "shared/components/StoryImage";
import { ClientStateManager } from "core/models/ClientStateManager";
import { optimizeImagePositions } from "./imageRepositioning";

// Types used within the utility
interface ImageElement {
  position: number;
  element: React.ReactNode;
  placeholder: string;
  paragraphIndex: number;
  targetPosition?: number;
  targetParagraphIndex?: number;
  float?: "left" | "right";
  image?: ImageUI;
}

export interface TextSegment {
  type: "text" | "image";
  content: string | React.ReactNode;
}

interface ParagraphPosition {
  start: number;
  end: number;
}

/**
 * Normalizes text for proper paragraph handling
 * Ensures images don't create orphaned paragraphs
 */
export function normalizeStoryText(text: string): string {
  // Fix potential encoding issues
  text = text.normalize();

  // 1) Ensure a paragraph break before image-only lines: make the newline before an image double
  // so the image starts a new paragraph.
  text = text.replace(/\n(?!\n)(?=\s*\[image[^\]]*\])/g, "\n\n");

  // 2) Attach images that start a paragraph to the text that follows within that same paragraph.
  // Replace a single newline after an image with a space.
  text = text.replace(
    /(^|\n\n)(\s*\[image[^\]]*\])\n(?!\n)/g,
    (_m, p1, p2) => `${p1}${p2} `
  );

  // 3) If a new line begins with a comma, treat it as a soft wrap and join with a space
  text = text.replace(/\n\s*,/g, " ,");

  // 4) If an image appears at the very end of the text (possibly after some newlines),
  // attach it to the previous paragraph.
  text = text.replace(/\n+\s*(\[image[^\]]*\])\s*$/g, " $1");

  // 5) Collapse excessive newlines to a single paragraph break
  text = text.replace(/\n{3,}/g, "\n\n");

  // 6) Convert single newlines between non-newline chars to paragraph breaks (avoid touching existing \n\n)
  text = text.replace(/([^\n])\n([^\n])/g, "$1\n\n$2");

  return text;
}

/**
 * Splits text into paragraphs and calculates their positions
 */
export function calculateParagraphPositions(text: string): ParagraphPosition[] {
  const paragraphs = text.split(/\n\s*\n/);
  const positions: ParagraphPosition[] = [];
  let currentPos = 0;

  paragraphs.forEach((paragraph) => {
    const start = text.indexOf(paragraph, currentPos);
    const end = start + paragraph.length;
    positions.push({ start, end });
    currentPos = end;
  });

  return positions;
}

/**
 * Finds which paragraph an image position belongs to
 */
export function findImageParagraphIndex(
  imagePosition: number,
  paragraphPositions: ParagraphPosition[]
): number {
  for (let i = 0; i < paragraphPositions.length; i++) {
    const position = paragraphPositions[i];
    if (
      position &&
      imagePosition >= position.start &&
      imagePosition <= position.end
    ) {
      return i;
    }
  }
  // If not found, attach to last paragraph (common for end-of-text images)
  return Math.max(0, paragraphPositions.length - 1);
}

/**
 * Identifies text-only paragraphs (paragraphs that contain actual text, not just images)
 */
export function findTextParagraphs(
  text: string,
  paragraphPositions: ParagraphPosition[]
): Array<{ index: number; hasText: boolean }> {
  return paragraphPositions.map((pos, index) => {
    const content = text.substring(pos.start, pos.end);
    const textWithoutImages = content
      .replace(IMAGE_PLACEHOLDER_REGEX, "")
      .trim();
    return {
      index,
      hasText: textWithoutImages.length > 0,
    };
  });
}

/**
 * Handles orphaned images (images in paragraphs with no text) by attaching them to nearby text paragraphs
 */
export function attachOrphanedImages(
  imageElements: ImageElement[],
  text: string,
  paragraphPositions: ParagraphPosition[]
): void {
  const textParagraphs = findTextParagraphs(text, paragraphPositions).filter(
    (p) => p.hasText
  );

  const lastTextParagraphIndex =
    textParagraphs[textParagraphs.length - 1]?.index ??
    paragraphPositions.length - 1;

  imageElements.forEach((imageEl) => {
    // Safety check for paragraph index bounds
    if (imageEl.paragraphIndex >= paragraphPositions.length) {
      imageEl.paragraphIndex = Math.max(0, paragraphPositions.length - 1);
    }

    const targetPosition = paragraphPositions[imageEl.paragraphIndex];
    if (!targetPosition) return;

    const paragraphContent = text.substring(
      targetPosition.start,
      targetPosition.end
    );
    const textWithoutImages = paragraphContent
      .replace(IMAGE_PLACEHOLDER_REGEX, "")
      .trim();

    if (textWithoutImages.length === 0) {
      // This paragraph contains only images - find nearest text paragraph
      let targetParagraph = imageEl.paragraphIndex;

      // First try the previous paragraph
      if (imageEl.paragraphIndex > 0) {
        const prevParagraph = textParagraphs.find(
          (p) => p.index === imageEl.paragraphIndex - 1
        );
        if (prevParagraph) {
          targetParagraph = prevParagraph.index;
        }
      }

      // If no previous text paragraph, try the next one
      if (
        targetParagraph === imageEl.paragraphIndex &&
        imageEl.paragraphIndex < textParagraphs.length - 1
      ) {
        const nextParagraph = textParagraphs.find(
          (p) => p.index === imageEl.paragraphIndex + 1
        );
        if (nextParagraph) {
          targetParagraph = nextParagraph.index;
        }
      }

      // If still no text paragraph found, attach to the last available text paragraph
      if (
        targetParagraph === imageEl.paragraphIndex &&
        textParagraphs.length > 0
      ) {
        const lastTextParagraph = textParagraphs[textParagraphs.length - 1];
        if (lastTextParagraph) {
          targetParagraph = lastTextParagraph.index;
        }
      }

      imageEl.paragraphIndex = Math.max(
        0,
        Math.min(targetParagraph, lastTextParagraphIndex)
      );
    }
  });
}

/**
 * Creates image elements from image placeholders in text
 */
export function createImageElements(
  text: string,
  storyState: ClientStoryState,
  paragraphPositions: ParagraphPosition[]
): ImageElement[] {
  const matches = text.match(IMAGE_PLACEHOLDER_REGEX);
  if (!matches) return [];

  const stateManager = new ClientStateManager();
  const imageElements: ImageElement[] = [];

  matches.forEach((match) => {
    const imagePlaceholder: ImagePlaceholder = parseImagePlaceholder(match);
    const position = text.indexOf(match);

    // Check if the image exists in the library if generateImages is false
    const imageExists = stateManager.hasImage(
      storyState,
      imagePlaceholder.id,
      imagePlaceholder.source
    );

    // Skip if the image doesn't exist and generateImages is false
    if (!storyState.generateImages && !imageExists) {
      imageElements.push({
        position,
        placeholder: match,
        paragraphIndex: 0,
        element: null,
      });
      return;
    }

    const finalImage: ImageUI | null = createImageFromPlaceholder(
      imagePlaceholder,
      storyState
    );

    if (finalImage) {
      const paragraphIndex = findImageParagraphIndex(
        position,
        paragraphPositions
      );

      imageElements.push({
        position,
        placeholder: match,
        paragraphIndex,
        image: finalImage,
        float: (imagePlaceholder.float as "left" | "right") || "left",
        element: null,
      });
    } else {
      // For placeholders with no valid image, still record them so they get removed from text
      console.log("No image found for", match);
      imageElements.push({
        position,
        placeholder: match,
        paragraphIndex: 0,
        element: null,
      });
    }
  });

  return imageElements;
}

/**
 * Applies image repositioning using the tested logic from imageRepositioning.ts
 */
export function applyImageRepositioning(
  imageElements: ImageElement[],
  text: string,
  paragraphPositions: ParagraphPosition[]
): void {
  // First handle orphaned images
  attachOrphanedImages(imageElements, text, paragraphPositions);

  // Extract current positions (1-indexed for imageRepositioning.ts)
  const currentPositions = imageElements.map((img) => img.paragraphIndex + 1);
  const totalParagraphs = paragraphPositions.length;

  // Use the tested repositioning logic
  const optimizedPositions = optimizeImagePositions(
    currentPositions,
    totalParagraphs
  );

  // Apply the optimized positions back to image elements
  optimizedPositions.forEach((newPosition, index) => {
    if (index < imageElements.length) {
      const imageEl = imageElements[index];
      if (!imageEl) return;

      const newParagraphIndex = newPosition - 1; // Convert back to 0-indexed
      const targetPosition = paragraphPositions[newParagraphIndex];

      if (
        newParagraphIndex !== imageEl.paragraphIndex &&
        newParagraphIndex < paragraphPositions.length &&
        targetPosition
      ) {
        imageEl.targetParagraphIndex = newParagraphIndex;
        imageEl.paragraphIndex = newParagraphIndex;
      }
    }
  });
}

/**
 * Ensures that consecutive images are not floated to the same side.
 * Operates after paragraph repositioning, using reading order
 * (by paragraph index, then by original position).
 */
export function enforceAlternateFloats(imageElements: ImageElement[]): void {
  if (imageElements.length <= 1) return;

  const ordered = [...imageElements].sort((a, b) => {
    if (a.paragraphIndex !== b.paragraphIndex) {
      return a.paragraphIndex - b.paragraphIndex;
    }
    return a.position - b.position;
  });

  let previousFloat: "left" | "right" | undefined = undefined;
  for (const current of ordered) {
    const currentFloat = current.float || "left";
    if (previousFloat && currentFloat === previousFloat) {
      current.float = previousFloat === "left" ? "right" : "left";
      previousFloat = current.float;
    } else {
      current.float = currentFloat;
      previousFloat = current.float;
    }
  }
}

/**
 * Removes image placeholders from text segments
 */
export function removePlaceholders(
  segments: TextSegment[],
  placeholders: string[]
): void {
  placeholders.forEach((placeholder) => {
    const textSegmentIndex = segments.findIndex(
      (segment) =>
        segment.type === "text" &&
        (segment.content as string).includes(placeholder)
    );

    if (textSegmentIndex !== -1) {
      const segment = segments[textSegmentIndex];
      if (segment) {
        const textSegment = segment.content as string;
        segment.content = textSegment.replace(placeholder, "");
      }
    }
  });
}

/**
 * Inserts images into text segments at their target positions
 */
export function insertImages(
  segments: TextSegment[],
  imageElements: ImageElement[]
): void {
  imageElements.forEach((imageEl) => {
    if (!imageEl.placeholder) return;

    // Find the text segment containing this image placeholder
    const textSegmentIndex = segments.findIndex(
      (segment) =>
        segment.type === "text" &&
        (segment.content as string).includes(imageEl.placeholder)
    );

    if (textSegmentIndex === -1) return;

    const textSegmentObj = segments[textSegmentIndex];
    if (!textSegmentObj) return;

    const textSegment = textSegmentObj.content as string;
    const originalSplitIndex = textSegment.indexOf(imageEl.placeholder);

    if (originalSplitIndex === -1) return;

    // If this image should be repositioned
    if (
      imageEl.targetParagraphIndex !== undefined ||
      imageEl.targetPosition !== undefined
    ) {
      // First, remove the original placeholder
      const beforeOriginal = textSegment.substring(0, originalSplitIndex);
      const afterOriginal = textSegment.substring(
        originalSplitIndex + imageEl.placeholder.length
      );

      // Update the segment with placeholder removed
      segments[textSegmentIndex] = {
        type: "text",
        content: beforeOriginal + afterOriginal,
      };

      // Compute the absolute start of the target paragraph in the current text snapshot
      let absoluteTargetStart = -1;
      if (imageEl.targetParagraphIndex !== undefined) {
        const currentText = segments
          .filter((s) => s.type === "text")
          .map((s) => s.content as string)
          .join("");
        const currentParagraphs = calculateParagraphPositions(currentText);
        const targetPara = currentParagraphs[imageEl.targetParagraphIndex];
        if (targetPara) absoluteTargetStart = targetPara.start;
      } else if (imageEl.targetPosition !== undefined) {
        absoluteTargetStart = imageEl.targetPosition;
      }
      let currentPos = 0;
      let targetSegmentIndex = -1;
      let relativeTargetPos = -1;

      for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        if (segment && segment.type === "text") {
          const segmentText = segment.content as string;
          const segmentEnd = currentPos + segmentText.length;

          if (
            currentPos <= absoluteTargetStart &&
            absoluteTargetStart <= segmentEnd
          ) {
            targetSegmentIndex = i;
            relativeTargetPos = absoluteTargetStart - currentPos;
            break;
          }
          currentPos = segmentEnd;
        }
      }

      if (targetSegmentIndex !== -1 && relativeTargetPos !== -1) {
        const targetSegmentObj = segments[targetSegmentIndex];
        if (!targetSegmentObj) return;

        const targetSegment = targetSegmentObj.content as string;

        // Insert at the beginning of the target paragraph
        const beforeTarget = targetSegment.substring(0, relativeTargetPos);
        const afterTarget = targetSegment.substring(relativeTargetPos);

        const component = React.createElement(StoryImage, {
          key: `img-${imageEl.position}`,
          image: imageEl.image!,
          alt: imageEl.image?.description || "",
          caption: imageEl.image?.description || "",
          withinText: true,
          float: imageEl.float || "left",
        });

        segments.splice(
          targetSegmentIndex,
          1,
          { type: "text", content: beforeTarget },
          { type: "image", content: component },
          { type: "text", content: afterTarget }
        );
      }
    } else {
      // Regular in-place replacement
      const beforeText = textSegment.substring(0, originalSplitIndex);
      const afterText = textSegment.substring(
        originalSplitIndex + imageEl.placeholder.length
      );

      // Replace the text segment with three segments: before, image, after
      const component = React.createElement(StoryImage, {
        key: `img-${imageEl.position}`,
        image: imageEl.image!,
        alt: imageEl.image?.description || "",
        caption: imageEl.image?.description || "",
        withinText: true,
        float: imageEl.float || "left",
      });

      segments.splice(
        textSegmentIndex,
        1,
        ...([
          beforeText ? { type: "text", content: beforeText } : null,
          component ? { type: "image", content: component } : null,
          afterText ? { type: "text", content: afterText } : null,
        ].filter(Boolean) as TextSegment[])
      );
    }
  });
}

/**
 * Processes story text to handle image placeholders and proper positioning
 *
 * @param text The original story text with image placeholders
 * @param storyState The client story state containing image data
 * @returns An array of text and image segments ready for rendering
 */
export function processStoryText(
  text: string,
  storyState: ClientStoryState
): TextSegment[] {
  // Step 1: Normalize text and handle paragraph breaks
  text = normalizeStoryText(text);

  // Step 2: Check if text contains image placeholders
  const matches = text.match(IMAGE_PLACEHOLDER_REGEX);
  if (!matches) {
    return [{ type: "text", content: text }];
  }

  // Step 3: Calculate paragraph positions
  const paragraphPositions = calculateParagraphPositions(text);

  // Step 4: Create image elements from placeholders
  const imageElements = createImageElements(
    text,
    storyState,
    paragraphPositions
  );

  // Step 5: Apply image repositioning using tested logic
  const validImageElements = imageElements
    .filter((el) => !!el.image)
    .sort((a, b) => a.position - b.position);

  applyImageRepositioning(validImageElements, text, paragraphPositions);

  // Ensure alternating floats after repositioning
  enforceAlternateFloats(validImageElements);

  // Step 6: Build segments starting with all text
  const segments: TextSegment[] = [{ type: "text", content: text }];

  // Step 7: Insert images at their final positions
  insertImages(segments, validImageElements);

  // Step 8: Remove any remaining placeholders for images that couldn't be displayed
  const nonValidPlaceholders = imageElements
    .filter((el) => !el.element && el.placeholder)
    .map((el) => el.placeholder);

  removePlaceholders(segments, nonValidPlaceholders);

  return segments;
}
