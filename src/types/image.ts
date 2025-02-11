import { z } from "zod";

export const imageUrlSchema = z
  .string()
  .url()
  .describe("URL where the generated image is stored");

export const imageGenerationSchema = z.object({
  prompt: z
    .string()
    .describe(
      `Prompt for AI image generation. Include the term 'digital art'. Don't include characters (the AI can't keep them consistent). Focus on the scene. Keep it under 200 characters.`
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

export const imageSchema = imageGenerationSchema.extend({
  url: imageUrlSchema,
});

export const imageLibrarySchema = z.array(imageSchema);

export type ImageLibrary = z.infer<typeof imageLibrarySchema>;
export type ImageGeneration = z.infer<typeof imageGenerationSchema>;
export type Image = z.infer<typeof imageSchema>;
