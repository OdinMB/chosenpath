import dotenv from "dotenv";
import OpenAI, { toFile } from "openai";
import type {
  ImageEditParams,
  ImageGenerateParams,
} from "openai/resources/images";
import { IMAGE_QUALITIES, IMAGE_SIZES } from "core/types/index.js";
import type {
  Image,
  ImageReference,
  BeatsNeedingImages,
  ImageSize,
  ImageQuality,
  ImageInstructions,
} from "core/types/index.js";
import { Story } from "core/models/Story.js";
import {
  IMAGE_GENERATION_MODEL,
  IMAGE_GENERATION_OUTPUT_COMPRESSION,
} from "server/config.js";
import fs from "fs";
import path from "path";
import { getStoragePath } from "shared/storageUtils.js";
import { v4 as uuidv4 } from "uuid";
import { Logger } from "shared/logger.js";
dotenv.config();

export class AIImageGenerator {
  private openai: OpenAI;

  constructor() {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY environment variable is not set");
    }
    this.openai = new OpenAI();
  }

  public async generateImageForTemplate(
    imageId: string,
    templateId: string,
    elementAppearance: string,
    imageInstructions?: ImageInstructions,
    references?: ImageReference[],
    size?: ImageSize,
    quality?: ImageQuality
  ): Promise<string> {
    const prompt = this.getImagePrompt(elementAppearance, imageInstructions);
    const imageBuffer = await this.generateImage(
      prompt,
      references,
      size,
      quality
    );
    return this.saveImageToTemplate(imageId, templateId, imageBuffer);
  }

  public getImagePrompt(
    elementAppearance: string,
    imageInstructions?: ImageInstructions
  ) {
    let prompt: string = "";
    prompt += `Generate an image that can accompany the following story element in a story book\n\n`;
    prompt += `==========\n${elementAppearance}\n==========`;
    if (imageInstructions) {
      prompt += `\n\nConsider the following general guidelines for images in this story:\n\n==========\n`;

      // Format the ImageInstructions object into a readable string
      Object.entries(imageInstructions).forEach(([key, value]) => {
        if (value) {
          prompt += `${key}: ${value}\n`;
        }
      });

      prompt += `==========`;
    }
    return prompt;
  }

  private async generateImage(
    prompt: string,
    references?: ImageReference[],
    size?: ImageSize,
    quality?: ImageQuality
  ): Promise<Buffer> {
    try {
      Logger.Story.log("Generating image for prompt:", prompt);

      const baseParams = {
        model: IMAGE_GENERATION_MODEL,
        prompt,
        moderation: "low",
        n: 1,
        quality: quality || IMAGE_QUALITIES.MEDIUM,
        output_format: "jpeg",
        output_compression: IMAGE_GENERATION_OUTPUT_COMPRESSION,
        size: size || IMAGE_SIZES.AUTO,
      };

      // Generate the image using either generate or edit API endpoint
      let referenceImages: any[] = [];
      let withReferences: boolean = false;
      if (references && references.length > 0) {
        referenceImages = await this.loadReferenceImages(references);
        withReferences = referenceImages.length > 0;
      }

      let imageResponse: any;
      if (withReferences) {
        const imageParams = {
          ...baseParams,
          image: referenceImages,
        } as ImageEditParams;
        imageResponse = await this.openai.images.edit(imageParams);
      } else {
        const imageParams = {
          ...baseParams,
        } as ImageGenerateParams;
        imageResponse = await this.openai.images.generate(imageParams);
      }

      let imageBuffer: Buffer;
      if (imageResponse.data?.[0]?.b64_json) {
        imageBuffer = Buffer.from(imageResponse.data[0].b64_json, "base64");
      } else {
        throw new Error("No image data in response from images.edit");
      }

      return imageBuffer;
    } catch (error) {
      Logger.Story.error("Error generating image:", error);
      throw error;
    }
  }

  /**
   * Loads reference images for image generation
   * @param templateId - The ID of the template
   * @param imageIds - Array of image IDs to use as references
   * @returns Array of OpenAI-compatible File objects
   */
  private async loadReferenceImages(
    references: ImageReference[]
  ): Promise<any[]> {
    const templatesBasePath = getStoragePath("library");
    const storiesBasePath = getStoragePath("stories");

    const referenceImages: any[] = [];
    for (const reference of references) {
      const imageBaseDir =
        reference.source === "template" ? templatesBasePath : storiesBasePath;
      const imageDir = path.join(imageBaseDir, reference.sourceId);
      const imagePath = path.join(imageDir, `${reference.id}.jpeg`);

      // Check if the file exists
      if (fs.existsSync(imagePath)) {
        try {
          const stream = fs.createReadStream(imagePath);
          const file = await toFile(stream, null, { type: "image/jpeg" });
          referenceImages.push(file);
          Logger.Story.log(
            `Loaded reference image: ${reference.id} in ${reference.source}-${reference.sourceId}`
          );
        } catch (error) {
          Logger.Story.error(
            `Reference image found but failed to load: ${reference.id} in ${reference.source}-${reference.sourceId}:`,
            error
          );
        }
      } else {
        Logger.Story.warn(
          `Reference image not found: ${reference.id} in ${reference.source}-${reference.sourceId}`
        );
      }
    }

    return referenceImages;
  }

  private async saveImageToTemplate(
    imageId: string,
    templateId: string,
    imageBuffer: Buffer
  ): Promise<string> {
    try {
      const fileName = `${imageId}.jpeg`;
      // Get the template directory path using storageUtils
      const templatesBasePath = getStoragePath("library");
      // Create the template-specific directory if it doesn't exist
      const templateDir = path.join(templatesBasePath, templateId, "images");
      if (!fs.existsSync(templateDir)) {
        fs.mkdirSync(templateDir, { recursive: true });
      }
      // Save the image
      const filePath = path.normalize(path.join(templateDir, fileName));
      fs.writeFileSync(filePath, imageBuffer);
      Logger.Story.log(`Saved image ${imageId} to template: ${templateId}`);
      return filePath;
    } catch (error) {
      Logger.Story.error(
        `Error saving image ${imageId} to template: ${templateId}`,
        error
      );
      throw error;
    }
  }

  private async saveImageToTemp(imageBuffer: Buffer): Promise<string> {
    try {
      const tempBasePath = getStoragePath("temp");
      const tempPath = path.normalize(
        path.join(tempBasePath, `${uuidv4()}.jpeg`)
      );
      fs.writeFileSync(tempPath, imageBuffer);
      return tempPath;
    } catch (error) {
      Logger.Story.error("Error saving image to template:", error);
      throw error;
    }
  }

  async generateImagesForBeats(
    story: Story,
    beatsNeedingImages: BeatsNeedingImages
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
            description: `Image for: ${beat.text.substring(0, 50)}...`,
            status: "generating",
            source: "story",
          };
          updatedStory = updatedStory.addImage(placeholderImage);

          // Generate actual image
          const imagePath = await this.generateImage(
            `Digital art illustration for a story book. The image is supposed to accompany the following text:\n\n${beat.text}. `
          );

          updatedStory = updatedStory.updateImage(imageId, {
            url: imagePath, // We're storing local path as URL for now
            prompt: beat.text,
            description: `Image for: ${beat.text.substring(0, 50)}...`,
            status: "complete",
          });

          updatedStory = updatedStory.setCurrentBeatImage(playerSlot, imageId);
        } catch (error) {
          Logger.Story.error("Failed to generate image for beat:", error);
        }
      }
    );

    await Promise.all(imagePromises);

    return updatedStory;
  }
}

export const aiImageGenerator = new AIImageGenerator();
