import OpenAI from "openai";
import type { Image } from "../../../shared/types/image.js";
import type { StoryState } from "../../../shared/types/story.js";
import type { Beat } from "../../../shared/types/beat.js";
import dotenv from 'dotenv';
dotenv.config();

export class ImageService {
  private openai: OpenAI;

  constructor() {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY environment variable is not set");
    }
    this.openai = new OpenAI();
  }

  async generateImage(imageGeneration: Omit<Image, "url">): Promise<Image | null> {
    try {
      const imageResponse = await this.openai.images.generate({
        model: "dall-e-3",
        prompt: imageGeneration.prompt,
        n: 1,
        size: "1024x1024",
      });

      if (imageResponse.data[0].url) {
        return {
          ...imageGeneration,
          url: imageResponse.data[0].url,
        };
      }
      return null;
    } catch (error) {
      console.error("Failed to generate image:", error);
      return null;
    }
  }

  updateStateWithImage(state: StoryState, image: Image): StoryState {
    return {
      ...state,
      images: [...state.images, image],
      beatHistory: state.beatHistory.map((beat, index) => {
        if (index === state.beatHistory.length - 1) {
          return {
            ...beat,
            imageId: image.id
          };
        }
        return beat;
      })
    };
  }
}

export const imageService = new ImageService(); 