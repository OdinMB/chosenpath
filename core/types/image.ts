import { z } from "zod";
import { Beat } from "./beat.js";

// Image generation constants
export const IMAGE_SIZES = {
  AUTO: "auto",
  SQUARE: "1024x1024",
  LANDSCAPE: "1536x1024",
  PORTRAIT: "1024x1536",
} as const;

export const IMAGE_QUALITIES = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
} as const;

export type ImageSize = (typeof IMAGE_SIZES)[keyof typeof IMAGE_SIZES];
export type ImageQuality =
  (typeof IMAGE_QUALITIES)[keyof typeof IMAGE_QUALITIES];

export const imageSourceSchema = z.enum(["template", "story"]);
export type ImageSource = z.infer<typeof imageSourceSchema>;

// Pointing to a file in the storage
export type ImageReference = {
  id: string;
  source: ImageSource;
  sourceId: string; // templateId or storyId
  subDirectory?: string;
  fileType: "jpeg" | "png";
};

// Images displayed in the UI
export type ImageStatus = "ready" | "generating" | "failed";
export type ImageUI = ImageReference & {
  status?: ImageStatus;
  description?: string;
};

export type ImagePlaceholder = {
  id: string;
  source: ImageSource;
  desc?: string;
  fileType?: "jpeg" | "png";
  subDir?: string;
  float?: "left" | "right";
};

export type ImageStoryState = {
  id: string;
  source: ImageSource;
  description?: string;
};
export type ImageLibrary = ImageStoryState[];

export type BeatsNeedingImages = Record<string, Beat>;

export const imageInstructionsSchema = z
  .object({
    visualStyle: z
      .string()
      .describe(
        "The primary artistic style for images in this visual novel. Depending on the story, safe options could be anime, semi-realistic, digital illustration, fantasy illustration, graphic novel, Pixar, etc. Can also be experimental if it fits the story, lik watercolor or pixel art."
      ),
    atmosphere: z
      .string()
      .describe(
        "1 sentence: the mood or emotional tone that should pervade all images"
      ),
    colorPalette: z
      .string()
      .describe(
        "A few words: A rough tendency for the color palette of the images. Examples: 'neon colors', 'somewhat muted', 'sepia tone', etc."
      ),
    settingDetails: z
      .string()
      .describe(
        "A few short elements. NOT a list of specific elements, but rather a description of visual motifs in the world. Examples: how magical effects look like, general architectural style, etc."
      ),
    characterStyle: z
      .string()
      .describe(
        "A few concise pointers. How characters should be consistently depicted."
      ),
    artInfluences: z
      .string()
      .describe(
        "A few words: Art movements or media styles that should influence the imagery. Don't mention specific artists or studios."
      ),
    coverPrompt: z
      .string()
      .describe(
        "Prompt for generating the cover image. Focus on the elements that should be included in the cover image. Stylistic instructions will be added by the system based on the attributes above. Remember that the identity of the player characters is not yet known."
      ),
  })
  .describe(
    "Visual styling instructions to maintain consistent aesthetics across all generated images. Will be added to all image generation prompts. Must still be flexible enough to generate all images for the story."
  );
export type ImageInstructions = z.infer<typeof imageInstructionsSchema>;

export const imageRequestSchema = z.object({
  caption: z
    .string()
    .describe(
      "Caption for the image. Up to six words. Focus on the elements in the picture so we can reuse the image in a later beat."
    ),
  id: z
    .string()
    .describe(
      "The ID of the dynamic image. Don't override existing ids of images that are already in the image library of this story."
    ),
  referenceImageIds: z
    .array(z.string())
    .describe(
      "The IDs of the images to use as references for the dynamic image. Leave empty if no reference image is needed (e.g. for a close-up of a new story element). Only use existing images from the image library. Remember that story elements don't necessarily have an image with the same id. Only include images with characters or elements that the AI needs to generate the new image. Remember that each image reference costs money."
    ),
  prompt: z
    .string()
    .describe(
      "A prompt to generate the dynamic image. Will be submitted to the LLM in addition to general image generation instructions for this story and the reference images (if any). No need to include instructions for overall aesthetics, just describe what's in the image."
    ),
});
export type ImageRequest = z.infer<typeof imageRequestSchema>;
