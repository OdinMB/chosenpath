import { z } from "zod";
import { Beat } from "./beat.js";

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

export type Image = {
  id: string;
  prompt: string;
  description: string;
  url?: string;
  status: ImageStatus;
};

export type ImageLibrary = Image[];

export type ImageGeneration = z.infer<typeof imageGenerationSchema>;

export type BeatsNeedingImages = Record<string, Beat>;
