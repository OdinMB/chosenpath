import dotenv from "dotenv";
import OpenAI from "openai";
import { IMAGE_QUALITIES, IMAGE_SIZES } from "core/types/index.js";
import type {
  Image,
  BeatsNeedingImages,
  ImageSize,
  ImageQuality,
} from "core/types/index.js";
import { Story } from "core/models/Story.js";
import {
  IMAGE_GENERATION_MODEL,
  IMAGE_GENERATION_OUTPUT_COMPRESSION,
} from "server/config.js";
import fs from "fs";
import path from "path";
import { getStoragePath } from "../../shared/storageUtils.js";
import { v4 as uuidv4 } from "uuid";

dotenv.config();

export class AIImageGenerator {
  private openai: OpenAI;

  constructor() {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY environment variable is not set");
    }
    this.openai = new OpenAI();
  }

  private async generateImage(
    prompt: string,
    templateId?: string,
    quality?: ImageQuality,
    size?: ImageSize
  ): Promise<string> {
    try {
      console.log("Generating image with prompt:", prompt);

      // Based on https://platform.openai.com/docs/guides/image-generation?image-generation-model=gpt-image-1
      const imageResponse = await this.openai.images.generate({
        model: IMAGE_GENERATION_MODEL,
        prompt,
        moderation: "low",
        n: 1,
        quality: quality || IMAGE_QUALITIES.MEDIUM,
        output_compression: IMAGE_GENERATION_OUTPUT_COMPRESSION,
        size: size || IMAGE_SIZES.SQUARE,
      });

      // Get the image data - either from b64_json or URL
      let imageBuffer: Buffer;

      if (imageResponse.data?.[0]?.b64_json) {
        // If we have base64 data, use it directly
        imageBuffer = Buffer.from(imageResponse.data[0].b64_json, "base64");
      } else if (imageResponse.data?.[0]?.url) {
        // If we have a URL, download it
        imageBuffer = await this.downloadImageFromUrl(
          imageResponse.data[0].url
        );
      } else {
        console.error("Image response has no usable data");
        throw new Error("No image data in response");
      }

      // If templateId is provided, save the image to the template directory
      if (templateId) {
        const savedPath = await this.saveImageToTemplate(
          imageBuffer,
          templateId
        );
        return savedPath;
      }

      // Otherwise save to a temporary location and return the path
      const tempDir = path.join(process.cwd(), "data", "temp");
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const tempPath = path.normalize(path.join(tempDir, `${uuidv4()}.png`));
      fs.writeFileSync(tempPath, imageBuffer);
      return tempPath;
    } catch (error) {
      console.error("Error generating image:", error);
      throw error;
    }
  }

  private async downloadImageFromUrl(url: string): Promise<Buffer> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  private async saveImageToTemplate(
    imageBuffer: Buffer,
    templateId: string
  ): Promise<string> {
    const imageId = uuidv4();
    const fileName = `${imageId}.png`;

    // Get the template directory path using storageUtils
    const templatesBasePath = getStoragePath("library");

    // Create the template-specific directory if it doesn't exist
    const templateDir = path.join(templatesBasePath, templateId);
    if (!fs.existsSync(templateDir)) {
      fs.mkdirSync(templateDir, { recursive: true });
    }

    // Save the image
    const filePath = path.normalize(path.join(templateDir, fileName));
    fs.writeFileSync(filePath, imageBuffer);

    return filePath;
  }

  async generateImagesForBeats(
    story: Story,
    beatsNeedingImages: BeatsNeedingImages,
    templateId?: string
  ): Promise<Story> {
    let updatedStory = story;

    // Generate images in parallel
    const imagePromises = Object.entries(beatsNeedingImages).map(
      async ([playerSlot, beat]) => {
        try {
          // Create image ID
          const imageId = uuidv4();

          // Add placeholder to image library
          const placeholderImage: Image = {
            id: imageId,
            prompt: beat.text,
            description: `Image for: ${beat.text.substring(0, 50)}...`,
            status: "generating",
          };
          updatedStory = updatedStory.addImage(placeholderImage);

          // Generate actual image
          const imagePath = await this.generateImage(
            `Digital art illustration of: ${beat.text}. No text.`,
            templateId
          );

          updatedStory = updatedStory.updateImage(imageId, {
            url: imagePath, // We're storing local path as URL for now
            prompt: beat.text,
            description: `Image for: ${beat.text.substring(0, 50)}...`,
            status: "complete",
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

  async generateSingleImage(
    prompt: string,
    templateId?: string
  ): Promise<string> {
    try {
      // Simplify the prompt to match OpenAI examples
      return await this.generateImage(prompt, templateId);
    } catch (error) {
      console.error("Failed to generate image:", error);
      throw error;
    }
  }
}

export const aiImageGenerator = new AIImageGenerator();
