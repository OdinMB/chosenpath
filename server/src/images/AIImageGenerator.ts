import dotenv from "dotenv";
import OpenAI, { toFile } from "openai";
import type {
  ImageEditParams,
  ImageGenerateParams,
} from "openai/resources/images";
import { IMAGE_QUALITIES, IMAGE_SIZES } from "core/types/index.js";
import type {
  ImageStoryState,
  ImageReference,
  ImageRequest,
  ImageSize,
  ImageQuality,
  ImageInstructions,
  ImageSource,
} from "core/types/index.js";
import { Story } from "core/models/Story.js";
import {
  IMAGE_GENERATION_MODEL,
  IMAGE_GENERATION_OUTPUT_COMPRESSION,
  IMAGE_GENERATION_BEAT_QUALITY,
  IMAGE_GENERATION_TEMPLATE_ELEMENT_QUALITY,
  IMAGE_GENERATION_TEMPLATE_PLAYER_QUALITY,
  IMAGE_GENERATION_TEMPLATE_COVER_QUALITY,
} from "server/config.js";
import fs from "fs";
import path from "path";
import { getStoragePath } from "shared/storageUtils.js";
import { Logger } from "shared/logger.js";
import sharp from "sharp";
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
      quality || IMAGE_GENERATION_TEMPLATE_ELEMENT_QUALITY
    );
    return this.saveImageToTemplate(imageId, templateId, imageBuffer);
  }

  public async generatePlayerImageForTemplate(
    playerSlot: string,
    identityIndex: number,
    templateId: string,
    appearance: string,
    imageInstructions?: ImageInstructions,
    size?: ImageSize,
    quality?: ImageQuality
  ): Promise<string> {
    // Create a unique ID for the player identity image
    const imageId = `${playerSlot}_${identityIndex}`;

    // Create the full prompt for the player character
    let prompt = `Generate a portrait image of a character with the following appearance:\n\n${appearance}`;

    if (imageInstructions) {
      prompt += `\n\n${this.getPromptSectionFromImageInstructions(
        imageInstructions
      )}`;
    }

    Logger.Story.log(
      `Generating player image for ${playerSlot} identity ${identityIndex}`
    );

    // Generate the image
    const imageBuffer = await this.generateImage(
      prompt,
      undefined, // No references
      size || IMAGE_SIZES.PORTRAIT, // Default to portrait for player images
      quality || IMAGE_GENERATION_TEMPLATE_PLAYER_QUALITY
    );

    // Save the image in template/images/players directory
    return this.saveImageToTemplate(
      imageId,
      templateId,
      imageBuffer,
      "players" // image subdirectory
    );
  }

  public async generateCoverImageForTemplate(
    templateId: string,
    coverPrompt: string,
    imageInstructions?: ImageInstructions,
    size?: ImageSize,
    quality?: ImageQuality
  ): Promise<string> {
    // Create the full prompt combining cover prompt with image instructions
    let prompt = `Generate a cover image for a story with the following description:\n\n${coverPrompt}`;

    if (imageInstructions) {
      prompt += `\n\n${this.getPromptSectionFromImageInstructions(
        imageInstructions
      )}`;
    }

    Logger.Story.log("Generating cover image");

    // Generate the image at original size
    const originalImageBuffer = await this.generateImage(
      prompt,
      undefined, // No references
      size || IMAGE_SIZES.PORTRAIT, // Default to portrait for covers (1024x1536)
      quality || IMAGE_GENERATION_TEMPLATE_COVER_QUALITY
    );

    // Resize cover images to square format for better main page display
    const resizedImageBuffer = await this.resizeCoverImage(originalImageBuffer);

    // Save the resized image with 'cover' as the ID
    return this.saveImageToTemplate("cover", templateId, resizedImageBuffer);
  }

  public getImagePrompt(
    description: string,
    imageInstructions?: ImageInstructions
  ) {
    let prompt: string = "";
    prompt += `Generate an image that can accompany the following scene or story element in a story book\n\n`;
    prompt += `==========\n${description}\n==========`;
    if (imageInstructions) {
      prompt += `\n\n${this.getPromptSectionFromImageInstructions(
        imageInstructions
      )}`;
    }
    return prompt;
  }

  private getPromptSectionFromImageInstructions(
    imageInstructions: ImageInstructions
  ): string {
    let prompt = "=======\n\n";

    // Format each instruction with its key
    const instructionMap: Record<string, string> = {
      visualStyle: "Visual Style",
      atmosphere: "Atmosphere",
      colorPalette: "Color Palette",
      settingDetails: "Setting Details",
      characterStyle: "Character Style",
      artInfluences: "Art Influences",
    };

    // Add each non-empty instruction to the formatted string
    Object.entries(imageInstructions).forEach(([key, value]) => {
      // Skip the coverPrompt itself since we're already using it
      if (key !== "coverPrompt" && value) {
        const label = instructionMap[key] || key;
        prompt += `${label}: ${value}\n`;
      }
    });
    prompt += `Text: Don't include any title or caption texts in the image.`;

    return prompt;
  }

  /**
   * Resize cover images from portrait (1024x1536) to smaller portrait (683x1024) format
   * for better display on the main page where multiple covers are shown
   */
  private async resizeCoverImage(imageBuffer: Buffer): Promise<Buffer> {
    try {
      Logger.Story.log("Resizing cover image to smaller portrait format");

      // Calculate target dimensions maintaining aspect ratio
      // Original: 1024x1536, Target height: 768px
      // Target width: 768 * (1024/1536) = 683px (rounded)
      const targetWidth = Math.round(768 * (1024 / 1536));
      const targetHeight = 768;

      const resizedBuffer = await sharp(imageBuffer)
        .resize(targetWidth, targetHeight, {
          fit: "inside", // Resize to fit within dimensions, maintaining aspect ratio
          withoutEnlargement: true,
        })
        .jpeg({
          quality: IMAGE_GENERATION_OUTPUT_COMPRESSION,
          progressive: true,
        })
        .toBuffer();

      Logger.Story.log(
        `Cover image resized successfully to ${targetWidth}x${targetHeight}`
      );
      return resizedBuffer;
    } catch (error) {
      Logger.Story.error("Error resizing cover image:", error);
      // Return original buffer if resizing fails
      return imageBuffer;
    }
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
        quality: quality || IMAGE_QUALITIES.LOW, // low for security
        output_format: "jpeg",
        output_compression: IMAGE_GENERATION_OUTPUT_COMPRESSION,
        size: size || IMAGE_SIZES.AUTO,
      };

      // Generate the image using either generate or edit API endpoint
      let referenceImages: any[] = [];
      let withReferences: boolean = false;
      if (references && references.length > 0) {
        referenceImages = await this.loadReferenceImages(references);
        withReferences = true;
      }

      let imageResponse: any;
      if (withReferences) {
        const imageParams = {
          ...baseParams,
          image: referenceImages,
        } as ImageEditParams;
        Logger.Story.log("Generating image with references");
        imageResponse = await this.openai.images.edit(imageParams);
      } else {
        const imageParams = {
          ...baseParams,
        } as ImageGenerateParams;
        Logger.Story.log("Generating image without references");
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
   * @param references: Array of ImageReference objects
   * @returns Array of OpenAI-compatible File objects
   */
  private async loadReferenceImages(
    references: ImageReference[]
  ): Promise<any[]> {
    const templatesBasePath = getStoragePath("templates");
    const storiesBasePath = getStoragePath("stories");

    const referenceImages: any[] = [];
    for (const reference of references) {
      const imageBaseDir =
        reference.source === "template" ? templatesBasePath : storiesBasePath;
      const imageDir = path.join(
        imageBaseDir,
        reference.sourceId,
        "images",
        reference.subDirectory || ""
      );
      const imagePath = path.join(imageDir, `${reference.id}.jpeg`);

      // Check if the file exists
      if (fs.existsSync(imagePath)) {
        try {
          const stream = fs.createReadStream(imagePath);
          const file = await toFile(stream, null, { type: "image/jpeg" });
          referenceImages.push(file);
          Logger.Story.log(`Loaded reference image: ${imagePath}`);
        } catch (error) {
          Logger.Story.error(
            `Reference image found but failed to load: ${imagePath}`,
            error
          );
        }
      } else {
        Logger.Story.warn(`Reference image not found: ${imagePath}`);
      }
    }

    return referenceImages;
  }

  private async saveImageToFile(
    imageId: string,
    source: ImageSource,
    sourceId: string, // templateId or storyId
    imageBuffer: Buffer,
    subDir?: string
  ): Promise<string> {
    try {
      let sourceURLString: string;
      if (source === "template") {
        sourceURLString = "templates";
      } else if (source === "story") {
        sourceURLString = "stories";
      } else {
        throw new Error("Invalid source");
      }

      const fileName = `${imageId.replace(/\//g, "_")}.jpeg`;
      // Get the template directory path using storageUtils
      const sourceBasePath =
        source === "template"
          ? getStoragePath("templates")
          : getStoragePath("stories");

      // Create the template-specific directory if it doesn't exist
      const storageDir = path.join(
        sourceBasePath,
        sourceId,
        "images",
        subDir || ""
      );
      if (!fs.existsSync(storageDir)) {
        fs.mkdirSync(storageDir, { recursive: true });
        Logger.Story.log(`Created ${source} images directory: ${storageDir}`);
      }

      // Save the image
      const filePath = path.normalize(path.join(storageDir, fileName));
      fs.writeFileSync(filePath, imageBuffer);
      Logger.Story.log(
        `Saved image ${imageId} to ${source}: ${sourceId} at path: ${filePath}`
      );

      // Return the access path with the correct route pattern /images/[templates/stories]/:sourceId/:path(*)
      return `/images/${sourceURLString}/${sourceId}/${
        subDir ? `${subDir}/` : ""
      }${fileName}`;
    } catch (error) {
      Logger.Story.error(
        `Error saving image ${imageId} to ${source}: ${sourceId}`,
        error
      );
      throw error;
    }
  }

  private async saveImageToTemplate(
    imageId: string,
    templateId: string,
    imageBuffer: Buffer,
    subDir?: string
  ): Promise<string> {
    return this.saveImageToFile(
      imageId,
      "template",
      templateId,
      imageBuffer,
      subDir
    );
  }

  private async saveImageToStory(
    imageId: string,
    storyId: string,
    imageBuffer: Buffer,
    subDir?: string
  ): Promise<string> {
    return this.saveImageToFile(imageId, "story", storyId, imageBuffer, subDir);
  }

  async generateImagesForBeats(
    story: Story,
    imageRequests: ImageRequest[],
    saveToStoryState: boolean = true
  ): Promise<Story> {
    let updatedStory = story;

    // Generate images in parallel
    const imagePromises = imageRequests.map(async (imageRequest) => {
      try {
        // Collect available reference images, log warnings for any missing ones
        const imageReferences: ImageReference[] = [];

        if (imageRequest.referenceImageIds.length > 0) {
          for (const id of imageRequest.referenceImageIds) {
            const ref = story.getImageReferenceFromImageId(id);
            if (ref) {
              imageReferences.push(ref);
            } else {
              Logger.Story.warn(
                `Reference image with ID '${id}' not found, continuing without it`
              );
            }
          }
        }

        const prompt = this.getImagePrompt(
          imageRequest.prompt,
          story.getImageInstructions()
        );
        const imageBuffer = await this.generateImage(
          prompt,
          imageReferences.length > 0 ? imageReferences : undefined,
          imageRequest.imageSize || IMAGE_SIZES.SQUARE, // faster/cheaper than other sizes. Allows using medium quality instead of low
          IMAGE_GENERATION_BEAT_QUALITY
        );

        await this.saveImageToStory(
          imageRequest.id,
          story.getId(),
          imageBuffer,
          imageRequest.subDir
        );

        // Player images for example are not added to the story state
        // They are just assumed to be available
        if (saveToStoryState) {
          const imageStoryState: ImageStoryState = {
            id: imageRequest.id,
            source: "story",
            description: imageRequest.caption,
          };

          updatedStory = updatedStory.addImage(imageStoryState);
        }
      } catch (error) {
        Logger.Story.error("Failed to generate image for beat:", error);
      }
    });

    await Promise.all(imagePromises);

    return updatedStory;
  }
}

export const aiImageGenerator = new AIImageGenerator();
