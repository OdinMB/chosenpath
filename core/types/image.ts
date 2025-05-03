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

export type ImageReference = {
  id: string;
  source: ImageSource;
  sourceId: string; // templateId or storyId
};

// Types used by the application
export type ImageStatus = "ready" | "generating" | "failed";

export type Image = {
  id: string;
  fileType: "jpeg" | "png";
  source: ImageSource;
  status: ImageStatus;
  subDirectory?: string;
  description?: string;
};

export type ImageLibrary = Image[];

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
