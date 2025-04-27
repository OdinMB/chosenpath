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

export type ImageSource = "template" | "story";

export type ImageReference = {
  id: string;
  source: ImageSource;
  sourceId: string; // templateId or storyId
};

// Types used by the application
export type ImageStatus = "ready" | "generating" | "failed";

export type Image = {
  id: string;
  source: ImageSource;
  description: string;
  status: ImageStatus;
};

export type ImageLibrary = Image[];

export type BeatsNeedingImages = Record<string, Beat>;

export const imageInstructionsSchema = z
  .object({
    visualStyle: z
      .string()
      .describe(
        "The primary artistic style for images (e.g., watercolor, pixel art, photorealistic)"
      ),
    atmosphere: z
      .string()
      .describe("The mood or emotional tone that should pervade all images"),
    colorPalette: z
      .string()
      .describe("Key colors or color scheme that should appear consistently"),
    settingDetails: z
      .string()
      .describe(
        "Essential visual elements of the world that should appear regularly"
      ),
    characterStyle: z
      .string()
      .describe("How characters should be consistently depicted"),
    artInfluences: z
      .string()
      .describe(
        "Artists, art movements, or media styles that should influence the imagery"
      ),
    coverPrompt: z
      .string()
      .describe(
        "Prompt for generating the cover image. Will be submitted in addition to the other instructions."
      ),
  })
  .describe(
    "Visual styling instructions to maintain consistent aesthetics across all generated images. Will be added to all image generation prompts. Must still be flexible enough to generate all images for the story."
  );
export type ImageInstructions = z.infer<typeof imageInstructionsSchema>;
