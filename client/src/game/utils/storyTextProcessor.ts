import React from "react";
import { ImagePlaceholder, ClientStoryState, ImageUI } from "core/types";
import {
  IMAGE_PLACEHOLDER_REGEX,
  parseImagePlaceholder,
  createImageFromPlaceholder,
} from "shared/utils/imageUtils.js";
import { StoryImage } from "shared/components/StoryImage";

// Types used within the utility
interface ImageElement {
  position: number;
  element: React.ReactNode;
  placeholder: string;
  paragraphIndex: number;
  renderPosition?: number;
  targetPosition?: number;
  originalPosition?: number;
}

interface TextSegment {
  type: "text" | "image";
  content: string | React.ReactNode;
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
  // Fix potential encoding issues by normalizing the text
  text = text.normalize();

  // Check if text contains image placeholders
  const matches = text.match(IMAGE_PLACEHOLDER_REGEX);

  // If no matches found, return a single text segment
  if (!matches) {
    return [{ type: "text", content: text }];
  }

  // Count paragraphs in the text
  const paragraphs = text.split(/\n\s*\n/);

  // Only apply spacing logic if we have at least 3 paragraphs and 2 images
  const shouldApplyImageSpacing = paragraphs.length >= 3 && matches.length >= 2;

  // First, locate all paragraphs and their positions
  const paragraphPositions: { start: number; end: number }[] = [];
  let currentPos = 0;

  paragraphs.forEach((paragraph) => {
    const start = text.indexOf(paragraph, currentPos);
    const end = start + paragraph.length;
    paragraphPositions.push({ start, end });
    currentPos = end;
  });

  // First, render all images and store them with their positions
  const imageElements: ImageElement[] = [];

  matches.forEach((match, index) => {
    const imagePlaceholder: ImagePlaceholder = parseImagePlaceholder(match);
    const finalImage: ImageUI | null = createImageFromPlaceholder(
      imagePlaceholder,
      storyState
    );

    // Always record the position of the placeholder for removal, even if the image can't be created
    const position = text.indexOf(match);

    // Only add to imageElements if we have a valid image
    if (finalImage) {
      // Determine which paragraph this image belongs to
      let paragraphIndex = 0;
      for (let i = 0; i < paragraphPositions.length; i++) {
        if (
          position >= paragraphPositions[i].start &&
          position <= paragraphPositions[i].end
        ) {
          paragraphIndex = i;
          break;
        }
      }

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
        paragraphIndex: 0, // This doesn't matter since we're not rendering an image
        element: null, // No element to render
      });
    }
  });

  // Sort the valid image elements by their original position in the text
  const validImageElements = imageElements
    .filter((el) => el.element !== null)
    .sort((a, b) => a.position - b.position);

  // Apply spacing rules if needed (avoid images being too close)
  if (shouldApplyImageSpacing) {
    // Find paragraph for each image (already done above)

    // Check if images are too close together and create target positions
    for (let i = 1; i < validImageElements.length; i++) {
      const prevImage = validImageElements[i - 1];
      const currentImage = validImageElements[i];

      // Only reposition if we know which paragraphs they're in
      if (
        prevImage.paragraphIndex !== undefined &&
        currentImage.paragraphIndex !== undefined
      ) {
        // Calculate paragraph gap between consecutive images
        const paragraphGap =
          currentImage.paragraphIndex - prevImage.paragraphIndex;

        // Only reposition if images would appear in adjacent paragraphs or the same paragraph
        if (paragraphGap < 2) {
          // Calculate target paragraph to ensure at least 1 full paragraph between images
          const targetParagraph = prevImage.paragraphIndex + 2;

          // Only reposition if the target paragraph exists and would increase spacing
          if (
            targetParagraph < paragraphPositions.length &&
            targetParagraph > currentImage.paragraphIndex
          ) {
            // Create a new placeholder at the target location
            // Start of the target paragraph is usually better than end
            currentImage.targetPosition =
              paragraphPositions[targetParagraph].start;

            // The original position will be used to remove the placeholder
            currentImage.originalPosition = currentImage.position;

            console.log(
              `Repositioning image from paragraph ${currentImage.paragraphIndex} to ${targetParagraph} to ensure at least 1 paragraph between images`
            );
          }
        }
      }
    }
  }

  // Start with a segment containing all text
  const segments: TextSegment[] = [
    {
      type: "text",
      content: text,
    },
  ];

  // Process each image to either:
  // 1. Replace its placeholder in-place, or
  // 2. Remove its placeholder and position the image at a better location
  validImageElements.forEach((imageEl) => {
    // Skip if no placeholder is defined
    if (!imageEl.placeholder) return;

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

      // Then find the right segment to insert the image at target position
      const targetPosition = imageEl.targetPosition;

      // Find which text segment contains the target position
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

      // Target position may change slightly after other images are processed
      // So make sure we insert at a paragraph boundary if possible
      if (targetSegmentIndex !== -1 && relativeTargetPos !== -1) {
        const targetSegment = segments[targetSegmentIndex].content as string;
        let relativePosition = relativeTargetPos;

        // Find the closest paragraph start or end to the target position
        // First, split the segment into paragraphs
        const paragraphRanges: Array<{ start: number; end: number }> = [];
        let lastEnd = 0;

        // Find all paragraph boundaries in this segment
        const paragraphSplits = targetSegment.split(/(\n\s*\n)/);
        for (let i = 0; i < paragraphSplits.length; i++) {
          if (i % 2 === 0) {
            // Even indices contain paragraph content
            const paragraphStart = lastEnd;
            const paragraphEnd = paragraphStart + paragraphSplits[i].length;
            paragraphRanges.push({ start: paragraphStart, end: paragraphEnd });
            lastEnd = paragraphEnd;
          } else {
            // Odd indices contain paragraph separators (\n\n)
            lastEnd += paragraphSplits[i].length;
          }
        }

        // Find the closest paragraph start to our target position
        let closestDistance = Number.MAX_SAFE_INTEGER;
        let bestPosition = relativeTargetPos;

        paragraphRanges.forEach((range) => {
          // Check paragraph start
          const distToStart = Math.abs(range.start - relativeTargetPos);
          if (distToStart < closestDistance) {
            closestDistance = distToStart;
            bestPosition = range.start;
          }
        });

        // Use the best position found
        relativePosition = bestPosition;

        const beforeTarget = targetSegment.substring(0, relativePosition);
        const afterTarget = targetSegment.substring(relativePosition);

        // Split the target segment and insert image
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
        ...([
          beforeText ? { type: "text", content: beforeText } : null,
          { type: "image", content: imageEl.element },
          afterText ? { type: "text", content: afterText } : null,
        ].filter(Boolean) as TextSegment[])
      );
    }
  });

  return segments;
}
