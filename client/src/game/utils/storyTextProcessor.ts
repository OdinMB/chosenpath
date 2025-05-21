import React from "react";
import { ImagePlaceholder, ClientStoryState, ImageUI } from "core/types";
import {
  IMAGE_PLACEHOLDER_REGEX,
  parseImagePlaceholder,
  createImageFromPlaceholder,
} from "shared/utils/imageUtils.js";
import { StoryImage } from "shared/components/StoryImage";
import { ClientStateManager } from "core/models/ClientStateManager.js";

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

  const stateManager = new ClientStateManager();

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

    // Check if the image exists in the library if generateImages is false
    const imageExists = stateManager.hasImage(
      storyState,
      imagePlaceholder.id,
      imagePlaceholder.source
    );

    // Skip if the image doesn't exist and generateImages is false
    if (!storyState.generateImages && !imageExists) {
      // Record the position for removal but don't create an element
      const position = text.indexOf(match);
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
  if (shouldApplyImageSpacing && validImageElements.length >= 2) {
    // Make a working copy of the image positions for planning purposes
    const workingElements = validImageElements.map((img) => ({
      ...img,
      renderPosition: img.paragraphIndex,
    }));

    // Identify and fix spacing issues one pair at a time
    for (let i = 0; i < workingElements.length - 1; i++) {
      const currentImage = workingElements[i];
      const nextImage = workingElements[i + 1];

      // Calculate paragraph gap between consecutive images
      const paragraphGap =
        nextImage.renderPosition! - currentImage.renderPosition!;

      // Only adjust if images are too close (less than 2 paragraphs apart)
      if (paragraphGap < 2) {
        // Calculate distance for each option
        const moveNextForward = {
          targetParagraph: currentImage.renderPosition! + 2,
          distance: 2 - paragraphGap,
        };

        const moveCurrentBackward = {
          targetParagraph: nextImage.renderPosition! - 2,
          distance: 2 - paragraphGap,
        };

        // Evaluate options based on feasibility and minimal movement
        let chosenOption = null;

        // Option 1: Move next image forward
        if (moveNextForward.targetParagraph < paragraphPositions.length) {
          chosenOption = {
            imageIndex: i + 1,
            targetParagraph: moveNextForward.targetParagraph,
            direction: "forward",
          };
        }

        // Option 2: Move current image backward if it would be minimal
        if (moveCurrentBackward.targetParagraph >= 0) {
          // If no option chosen yet, or backward is minimal
          if (!chosenOption) {
            chosenOption = {
              imageIndex: i,
              targetParagraph: moveCurrentBackward.targetParagraph,
              direction: "backward",
            };
          }
        }

        // Apply the chosen repositioning
        if (chosenOption) {
          const imageToReposition = workingElements[chosenOption.imageIndex];
          const originalImage = validImageElements[chosenOption.imageIndex];

          // Set the target position for the actual image
          originalImage.targetPosition =
            paragraphPositions[chosenOption.targetParagraph].start;
          originalImage.originalPosition = originalImage.position;

          // Update working copy for next iteration
          imageToReposition.renderPosition = chosenOption.targetParagraph;

          // console.log(
          //   `Repositioning image from paragraph ${originalImage.paragraphIndex} to ${chosenOption.targetParagraph} (${chosenOption.direction}) for proper spacing`
          // );
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
          imageEl.element ? { type: "image", content: imageEl.element } : null,
          afterText ? { type: "text", content: afterText } : null,
        ].filter(Boolean) as TextSegment[])
      );
    }
  });

  // Also remove any remaining image placeholders from all imageElements (including non-valid ones)
  // This handles cases where images couldn't be displayed (null element)
  imageElements.forEach((imageEl) => {
    if (!imageEl.element && imageEl.placeholder) {
      // Find if any text segment still contains this placeholder
      const textSegmentIndex = segments.findIndex(
        (segment) =>
          segment.type === "text" &&
          (segment.content as string).includes(imageEl.placeholder)
      );

      if (textSegmentIndex !== -1) {
        const textSegment = segments[textSegmentIndex].content as string;
        // Simply remove the placeholder text
        segments[textSegmentIndex].content = textSegment.replace(
          imageEl.placeholder,
          ""
        );
      }
    }
  });

  return segments;
}
