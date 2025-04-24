import { z } from "zod";
import { Beat } from "./beat.js";

// Image generation constants
export const IMAGE_SIZES = {
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

// Only used for LLM generation
export const imageGenerationSchema = z.object({
  prompt: z
    .string()
    .describe(
      `Prompt for AI image generation. Include the terms 'digital art', 'illustration', and 'no text'. Keep it under 200 characters.`
    ),
  description: z
    .string()
    .describe("A very brief description of what the image shows (4-10 words)"),
  id: z
    .string()
    .describe(
      "Unique identifier for the image. Use a short phrase with underscores, like 'crashed_shuttle'."
    ),
});

// Types used by the application
export type ImageStatus = "ready" | "generating" | "failed";

export type Image = z.infer<typeof imageGenerationSchema> & {
  status: ImageStatus;
  url?: string;
};

export type ImageLibrary = Image[];

export type ImageGeneration = z.infer<typeof imageGenerationSchema>;

export type BeatsNeedingImages = Record<string, Beat>;
