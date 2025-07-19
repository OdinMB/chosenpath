import React from "react";
import { ImagePlaceholder, ClientStoryState, ImageUI } from "core/types";
import {
  IMAGE_PLACEHOLDER_REGEX,
  parseImagePlaceholder,
  createImageFromPlaceholder,
} from "shared/utils/imageUtils.js";
import { StoryImage } from "shared/components/StoryImage";
import { ClientStateManager } from "core/models/ClientStateManager.js";
import { optimizeImagePositions } from "./imageRepositioning";

// Types used within the utility
interface ImageElement {
  position: number;
  element: React.ReactNode;
  placeholder: string;
  paragraphIndex: number;
  targetPosition?: number;
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

  // First, protect image placeholders that are at the end of paragraphs
  text = text.replace(/(\[image[^\]]*\])(?:\s*\n)/g, '$1'); // Remove trailing newlines after images
  
  // Convert single \n to double \n\n, except around image tags
  text = text.replace(/(?<!\]\s*)\n(?!\n)(?!\s*\[image)/g, '\n\n').replace(/\n{3,}/g, '\n\n');
  
  // Ensure images at the end of text don't create orphaned paragraphs - attach to previous paragraph
  text = text.replace(/\n\n(\[image[^\]]*\])\s*$/, ' $1');

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
    if (imagePosition >= paragraphPositions[i].start && imagePosition <= paragraphPositions[i].end) {
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
    const textWithoutImages = content.replace(IMAGE_PLACEHOLDER_REGEX, '').trim();
    return {
      index,
      hasText: textWithoutImages.length > 0
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
  const textParagraphs = findTextParagraphs(text, paragraphPositions)
    .filter(p => p.hasText);
  
  const lastTextParagraphIndex = textParagraphs[textParagraphs.length - 1]?.index ?? paragraphPositions.length - 1;

  imageElements.forEach((imageEl) => {
    // Safety check for paragraph index bounds
    if (imageEl.paragraphIndex >= paragraphPositions.length) {
      imageEl.paragraphIndex = Math.max(0, paragraphPositions.length - 1);
    }
    
    const paragraphContent = text.substring(
      paragraphPositions[imageEl.paragraphIndex].start,
      paragraphPositions[imageEl.paragraphIndex].end
    );
    const textWithoutImages = paragraphContent.replace(IMAGE_PLACEHOLDER_REGEX, '').trim();
    
    if (textWithoutImages.length === 0) {
      // This paragraph contains only images - find nearest text paragraph
      let targetParagraph = imageEl.paragraphIndex;
      
      // First try the previous paragraph
      if (imageEl.paragraphIndex > 0) {
        const prevParagraph = textParagraphs.find(p => p.index === imageEl.paragraphIndex - 1);
        if (prevParagraph) {
          targetParagraph = prevParagraph.index;
        }
      }
      
      // If no previous text paragraph, try the next one  
      if (targetParagraph === imageEl.paragraphIndex && imageEl.paragraphIndex < textParagraphs.length - 1) {
        const nextParagraph = textParagraphs.find(p => p.index === imageEl.paragraphIndex + 1);
        if (nextParagraph) {
          targetParagraph = nextParagraph.index;
        }
      }
      
      // If still no text paragraph found, attach to the last available text paragraph
      if (targetParagraph === imageEl.paragraphIndex && textParagraphs.length > 0) {
        targetParagraph = textParagraphs[textParagraphs.length - 1].index;
      }
      
      imageEl.paragraphIndex = Math.max(0, Math.min(targetParagraph, lastTextParagraphIndex));
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

  matches.forEach((match, index) => {
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
      const paragraphIndex = findImageParagraphIndex(position, paragraphPositions);

      imageElements.push({
        position,
        placeholder: match,
        paragraphIndex,
        element: React.createElement(StoryImage, {
          key: `img-${index}`,
          image: finalImage,
          alt: finalImage.description || "",
          caption: finalImage.description || "",
          withinText: true,
          float: (imagePlaceholder.float as "left" | "right") || "left",
        }),
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
  const currentPositions = imageElements.map(img => img.paragraphIndex + 1);
  const totalParagraphs = paragraphPositions.length;

  // Use the tested repositioning logic
  const optimizedPositions = optimizeImagePositions(currentPositions, totalParagraphs);

  // Apply the optimized positions back to image elements
  optimizedPositions.forEach((newPosition, index) => {
    if (index < imageElements.length) {
      const imageEl = imageElements[index];
      const newParagraphIndex = newPosition - 1; // Convert back to 0-indexed
      
      if (newParagraphIndex !== imageEl.paragraphIndex && newParagraphIndex < paragraphPositions.length) {
        imageEl.targetPosition = paragraphPositions[newParagraphIndex].start;
        imageEl.paragraphIndex = newParagraphIndex;
      }
    }
  });
}

/**
 * Removes image placeholders from text segments
 */
export function removePlaceholders(segments: TextSegment[], placeholders: string[]): void {
  placeholders.forEach((placeholder) => {
    const textSegmentIndex = segments.findIndex(
      (segment) =>
        segment.type === "text" &&
        (segment.content as string).includes(placeholder)
    );

    if (textSegmentIndex !== -1) {
      const textSegment = segments[textSegmentIndex].content as string;
      segments[textSegmentIndex].content = textSegment.replace(placeholder, "");
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
    if (!imageEl.placeholder || !imageEl.element) return;

    // Find the text segment containing this image placeholder
    const textSegmentIndex = segments.findIndex(
      (segment) =>
        segment.type === "text" &&
        (segment.content as string).includes(imageEl.placeholder)
    );

    if (textSegmentIndex === -1) return;

    const textSegment = segments[textSegmentIndex].content as string;
    const originalSplitIndex = textSegment.indexOf(imageEl.placeholder);

    if (originalSplitIndex === -1) return;

    // If this image should be repositioned
    if (imageEl.targetPosition !== undefined) {
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

      // Find the target position and insert the image at paragraph start
      const targetPosition = imageEl.targetPosition;
      let currentPos = 0;
      let targetSegmentIndex = -1;
      let relativeTargetPos = -1;

      for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        if (segment.type === "text") {
          const segmentText = segment.content as string;
          const segmentEnd = currentPos + segmentText.length;

          if (currentPos <= targetPosition && targetPosition <= segmentEnd) {
            targetSegmentIndex = i;
            relativeTargetPos = targetPosition - currentPos;
            break;
          }
          currentPos = segmentEnd;
        }
      }

      if (targetSegmentIndex !== -1 && relativeTargetPos !== -1) {
        const targetSegment = segments[targetSegmentIndex].content as string;
        
        // Insert at the beginning of the target paragraph
        const beforeTarget = targetSegment.substring(0, relativeTargetPos);
        const afterTarget = targetSegment.substring(relativeTargetPos);

        segments.splice(
          targetSegmentIndex,
          1,
          { type: "text", content: beforeTarget },
          { type: "image", content: imageEl.element },
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
      segments.splice(
        textSegmentIndex,
        1,
        ...(([
          beforeText ? { type: "text", content: beforeText } : null,
          imageEl.element ? { type: "image", content: imageEl.element } : null,
          afterText ? { type: "text", content: afterText } : null,
        ]).filter(Boolean) as TextSegment[])
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
  const imageElements = createImageElements(text, storyState, paragraphPositions);

  // Step 5: Apply image repositioning using tested logic
  const validImageElements = imageElements
    .filter((el) => el.element !== null)
    .sort((a, b) => a.position - b.position);

  applyImageRepositioning(validImageElements, text, paragraphPositions);

  // Step 6: Build segments starting with all text
  const segments: TextSegment[] = [{ type: "text", content: text }];

  // Step 7: Insert images at their final positions
  insertImages(segments, validImageElements);

  // Step 8: Remove any remaining placeholders for images that couldn't be displayed
  const nonValidPlaceholders = imageElements
    .filter(el => !el.element && el.placeholder)
    .map(el => el.placeholder);
  
  removePlaceholders(segments, nonValidPlaceholders);

  return segments;
}