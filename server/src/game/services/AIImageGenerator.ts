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

  private async generateImage(
    prompt: string,
    templateId?: string,
    references?: ImageReference[],
    size?: ImageSize,
    quality?: ImageQuality
  ): Promise<string> {
    try {
      const fullPrompt = `Create a digital art illustration that we can show in a story book for the following story element:
<STORY ELEMENT>
${prompt}
</STORY ELEMENT>

The image itself should not contain any of this text.

Image instructions for this book: modern, slick, tense`;

      Logger.Story.log("Image prompt:\n" + fullPrompt);

      const baseParams = {
        model: IMAGE_GENERATION_MODEL,
        prompt: fullPrompt,
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

      const tempPath = path.normalize(path.join(tempDir, `${uuidv4()}.jpeg`));
      fs.writeFileSync(tempPath, imageBuffer);
      return tempPath;
    } catch (error) {
      console.error("Error generating image:", error);
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
    imageBuffer: Buffer,
    templateId: string
  ): Promise<string> {
    const imageId = uuidv4();
    const fileName = `${imageId}.jpeg`;

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
            description: `Image for: ${beat.text.substring(0, 50)}...`,
            status: "generating",
            source: "story",
          };
          updatedStory = updatedStory.addImage(placeholderImage);

          // Generate actual image
          const imagePath = await this.generateImage(
            `Digital art illustration for a story book. The image is supposed to accompany the following text:\n\n${beat.text}. `,
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
    templateId?: string,
    references?: ImageReference[]
  ): Promise<string> {
    try {
      // Pass reference images if provided
      return await this.generateImage(
        prompt,
        templateId,
        references,
        undefined,
        undefined
      );
    } catch (error) {
      console.error("Failed to generate image:", error);
      throw error;
    }
  }
}

export const aiImageGenerator = new AIImageGenerator();
