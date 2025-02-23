import OpenAI from "openai";
import type { Image, ImageGeneration } from "shared/types/image.js";
import type { StoryState } from "shared/types/story.js";
import type { Beat } from "shared/types/beat.js";
import dotenv from "dotenv";
import { ChatOpenAI } from "@langchain/openai";
import { imageGenerationSchema } from "shared/types/image.js";
import type { BeatsNeedingImages } from "shared/types/image.js";
dotenv.config();

export class AIImageGenerator {
  private openai: OpenAI;
  private model: ChatOpenAI;

  constructor() {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY environment variable is not set");
    }
    this.openai = new OpenAI();
    this.model = new ChatOpenAI({
      modelName: "o3-mini",
      reasoningEffort: "low",
      // modelName: "gpt-4o",
      // temperature: 0.4,
    });
  }

  private async generateImageRequest(beat: Beat): Promise<ImageGeneration> {
    const structuredModel = this.model.withStructuredOutput(
      imageGenerationSchema
    );
    const response = await structuredModel.invoke(
      `We need an image for the following story beat: ${beat.text}
      
      Include the terms 'digital art', 'illustration', and 'no text'. Keep it under 200 characters.`
    );
    console.log("Image generation response: ", response);
    return response;
  }

  private async generateImage(prompt: string): Promise<string> {
    const imageResponse = await this.openai.images.generate({
      model: "dall-e-3",
      prompt,
      n: 1,
      size: "1024x1024",
    });

    if (!imageResponse.data[0].url) {
      throw new Error("No URL in image response");
    }

    return imageResponse.data[0].url;
  }

  async generateImagesForBeats(
    state: StoryState,
    beatsNeedingImages: BeatsNeedingImages
  ): Promise<StoryState> {
    const updatedState = { ...state };

    // Generate image requests and images in parallel
    const imagePromises = Object.entries(beatsNeedingImages).map(
      async ([playerSlot, beat]) => {
        let imageGen: ImageGeneration;

        try {
          // Generate image request from beat
          imageGen = await this.generateImageRequest(beat);

          // Add placeholder to image library
          const placeholderImage: Image = {
            ...imageGen,
            id: imageGen.id || crypto.randomUUID(),
            prompt: imageGen.prompt || "",
            description: imageGen.description || "",
            status: "generating",
          };
          updatedState.images.push(placeholderImage);

          // Generate actual image
          const imageUrl = await this.generateImage(imageGen.prompt);

          // Return final image and player info
          return {
            playerSlot,
            image: {
              ...imageGen,
              id: imageGen.id || crypto.randomUUID(),
              prompt: imageGen.prompt || "",
              description: imageGen.description || "",
              url: imageUrl,
              status: "ready" as const,
            },
          };
        } catch (error) {
          console.error(`Failed to generate image for ${playerSlot}:`, error);
          return {
            playerSlot,
            image: {
              id: crypto.randomUUID(),
              prompt: "",
              description: "Failed to generate image",
              status: "failed" as const,
            },
          };
        }
      }
    );

    const results = await Promise.all(imagePromises);

    // Update state with generated images
    results.forEach(({ playerSlot, image }) => {
      // Update image in library
      const imageIndex = updatedState.images.findIndex(
        (img) => img.id === image.id
      );
      if (imageIndex !== -1) {
        updatedState.images[imageIndex] = image;
      }

      // Update beat with image id
      const player = updatedState.players[playerSlot];
      if (player && player.beatHistory.length > 0) {
        const lastBeat = player.beatHistory[player.beatHistory.length - 1];
        lastBeat.imageId = image.id;
      }
    });

    return updatedState;
  }
}

export const aiImageGenerator = new AIImageGenerator();
