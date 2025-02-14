import OpenAI from "openai";
import type { Image, ImageGeneration } from "../../../shared/types/image.js";
import type { StoryState } from "../../../shared/types/story.js";
import type { Beat } from "../../../shared/types/beat.js";
import dotenv from "dotenv";
dotenv.config();

export class AIImageGenerator {
  private openai: OpenAI;

  constructor() {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY environment variable is not set");
    }
    this.openai = new OpenAI();
  }

  async generateImagesForState(
    state: StoryState,
    imageGenerations: ImageGeneration[]
  ): Promise<StoryState> {
    if (!state.generateImages || imageGenerations.length === 0) {
      console.log("[AIImageGenerator] No images to generate");
      return state;
    }

    console.log(
      `[AIImageGenerator] Starting generation for ${imageGenerations.length} images`
    );

    const updatedState = { ...state };
    const newImages: Image[] = imageGenerations.map((gen) => ({
      ...gen,
      status: "generating" as const,
    }));

    // Add to image library
    updatedState.images.push(...newImages);
    console.log(
      `[AIImageGenerator] Added ${newImages.length} placeholder images to state`
    );

    // Generate all images in parallel
    console.log("[AIImageGenerator] Starting parallel image generation");
    const imagePromises = newImages.map(async (image) => {
      console.log(
        `[AIImageGenerator] Generating image for prompt: ${image.prompt.slice(
          0,
          50
        )}...`
      );
      try {
        const imageResponse = await this.openai.images.generate({
          model: "dall-e-3",
          prompt: image.prompt,
          n: 1,
          size: "1024x1024",
        });

        if (imageResponse.data[0].url) {
          return {
            ...image,
            url: imageResponse.data[0].url,
            status: "ready" as const,
          };
        }
        throw new Error("No URL in image response");
      } catch (error) {
        console.error(
          `[AIImageGenerator] Failed to generate image ${image.id}:`,
          error
        );
        return {
          ...image,
          status: "failed" as const,
        };
      }
    });

    // Wait for all images to complete
    const generatedImages = await Promise.all(imagePromises);
    const successCount = generatedImages.filter(
      (img) => img.status === "ready"
    ).length;
    const failedCount = generatedImages.filter(
      (img) => img.status === "failed"
    ).length;
    console.log(
      `[AIImageGenerator] Generation complete. Success: ${successCount}, Failed: ${failedCount}`
    );

    // Update images in state
    generatedImages.forEach((genImage) => {
      const imageIndex = updatedState.images.findIndex(
        (img) => img.id === genImage.id
      );
      if (imageIndex !== -1) {
        updatedState.images[imageIndex] = genImage;
      }
    });

    return updatedState;
  }
}

export const aiImageGenerator = new AIImageGenerator();
