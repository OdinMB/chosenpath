import OpenAI from "openai";
import type {
  Image,
  ImageGeneration,
  BeatsNeedingImages,
  Beat,
} from "@core/types/index.js";
import { imageGenerationSchema } from "@core/types/index.js";
import dotenv from "dotenv";
import { ChatOpenAI } from "@langchain/openai";
import { Story } from "@core/models/Story.js";
import {
  IMAGE_QUERY_MODEL_NAME,
  IMAGE_QUERY_MODEL_TEMPERATURE,
} from "@/config.js";

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
      modelName: IMAGE_QUERY_MODEL_NAME as string,
      temperature: IMAGE_QUERY_MODEL_TEMPERATURE as number,
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
    story: Story,
    beatsNeedingImages: BeatsNeedingImages
  ): Promise<Story> {
    let updatedStory = story;

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
            id: imageGen.id,
            prompt: imageGen.prompt || "",
            description: imageGen.description || "",
            status: "generating",
          };
          updatedStory = updatedStory.addImage(placeholderImage);

          // Generate actual image
          const imageUrl = await this.generateImage(imageGen.prompt);
          const imageId = imageGen.id;

          updatedStory = updatedStory.updateImage(imageId, {
            url: imageUrl,
            prompt: imageGen.prompt,
            description: imageGen.description,
          });

          updatedStory = updatedStory.setCurrentBeatImage(playerSlot, imageId);
        } catch (error) {
          console.error("Failed to generate image for beat:", error);
        }
      }
    );

    await Promise.all(imagePromises);

    return updatedStory;
  }
}

export const aiImageGenerator = new AIImageGenerator();
