import dotenv from "dotenv";
import OpenAI from "openai";
import { IMAGE_QUALITIES, IMAGE_SIZES } from "core/types/index.js";
import type {
  ImageStoryState,
  ImageReference,
  ImageRequest,
  ImageSize,
  ImageQuality,
  ImageInstructions,
  ImageSource,
  ImageGenerationErrorInfo,
} from "core/types/index.js";
import { Story } from "core/models/Story.js";
import {
  IMAGE_GENERATION_MODEL,
  IMAGE_GENERATION_TEMPLATE_MODEL,
  IMAGE_GENERATION_BEAT_QUALITY,
  IMAGE_GENERATION_TEMPLATE_ELEMENT_QUALITY,
  IMAGE_GENERATION_TEMPLATE_PLAYER_QUALITY,
  IMAGE_GENERATION_TEMPLATE_COVER_QUALITY,
} from "server/config.js";
import fs from "fs";
import path from "path";
import { getStoragePath } from "shared/storageUtils.js";
import { Logger } from "shared/logger.js";
import {
  analyzeImageGenerationError,
  loadReferenceImages,
  requestImage,
  type ImageApiClient,
} from "./openaiImageClient.js";
import {
  getImagePrompt,
  getTemplateCoverPrompt,
  getTemplatePlayerPortraitPrompt,
} from "./imagePrompts.js";
import { resizeTemplateCover } from "./templateCover.js";
dotenv.config();

/**
 * Enhanced error class for image generation that includes structured error information
 */
export class ImageGenerationError extends Error {
  public readonly imageGenerationError: ImageGenerationErrorInfo;

  constructor(message: string, errorInfo: ImageGenerationErrorInfo) {
    super(message);
    this.name = "ImageGenerationError";
    this.imageGenerationError = errorInfo;
  }
}

export class AIImageGenerator {
  private openai: ImageApiClient;

  /** Uses the OpenAI client unless an image client is passed in (tests). */
  constructor(imageClient?: ImageApiClient) {
    if (imageClient) {
      this.openai = imageClient;
      return;
    }
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
    const prompt = getImagePrompt(elementAppearance, imageInstructions);
    const imageBuffer = await this.generateImage(
      prompt,
      references,
      size,
      quality || IMAGE_GENERATION_TEMPLATE_ELEMENT_QUALITY,
      IMAGE_GENERATION_TEMPLATE_MODEL
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
    const prompt = getTemplatePlayerPortraitPrompt(
      appearance,
      imageInstructions
    );

    Logger.Story.log(
      `Generating player image for ${playerSlot} identity ${identityIndex}`
    );

    // Generate the image
    const imageBuffer = await this.generateImage(
      prompt,
      undefined, // No references
      size || IMAGE_SIZES.PORTRAIT, // Default to portrait for player images
      quality || IMAGE_GENERATION_TEMPLATE_PLAYER_QUALITY,
      IMAGE_GENERATION_TEMPLATE_MODEL
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
    references?: ImageReference[],
    size?: ImageSize,
    quality?: ImageQuality
  ): Promise<string> {
    // Create the full prompt combining cover prompt with image instructions
    const prompt = getTemplateCoverPrompt(coverPrompt, imageInstructions);

    Logger.Story.log("Generating cover image");

    // Generate the image at original size
    const originalImageBuffer = await this.generateImage(
      prompt,
      references && references.length > 0 ? references : undefined,
      size || IMAGE_SIZES.PORTRAIT, // Default to portrait for covers (1024x1536)
      quality || IMAGE_GENERATION_TEMPLATE_COVER_QUALITY,
      IMAGE_GENERATION_TEMPLATE_MODEL
    );

    // Shrink cover images for the library, where multiple covers are shown
    const resizedImageBuffer = await resizeTemplateCover(originalImageBuffer);

    // Save the resized image with 'cover' as the ID
    return this.saveImageToTemplate("cover", templateId, resizedImageBuffer);
  }

  private async generateImage(
    prompt: string,
    references: ImageReference[] | undefined,
    size: ImageSize | undefined,
    quality: ImageQuality | undefined,
    model: string
  ): Promise<Buffer> {
    try {
      Logger.Story.log("Generating image for prompt:", prompt);

      const referenceImages =
        references && references.length > 0
          ? await loadReferenceImages(references)
          : [];

      const result = await requestImage(this.openai, {
        prompt,
        model,
        quality: quality || IMAGE_QUALITIES.LOW, // low for security
        size: size || IMAGE_SIZES.AUTO,
        images: referenceImages,
      });

      const usage = result.usage
        ? `input text ${result.usage.inputTextTokens}, input image ${result.usage.inputImageTokens}, output ${result.usage.outputTokens}`
        : "not reported";
      Logger.Story.log(
        `Image generated: model ${result.model}, quality ${result.quality}, size ${result.size}, ${result.imagesSent} reference image(s), usage ${usage}`
      );

      return result.buffer;
    } catch (error) {
      Logger.Story.error("Error generating image:", error);

      // Analyze the error and provide structured information
      const errorInfo = analyzeImageGenerationError(error, prompt);

      // Throw enhanced error with structured information
      throw new ImageGenerationError(errorInfo.userFriendlyMessage, errorInfo);
    }
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

  /**
   * Generates one in-game image and writes it to the story's image folder.
   * Rejects when generation or saving fails, so callers can tell a written
   * image from a failed one.
   */
  async generateBeatImage(
    story: Story,
    imageRequest: ImageRequest
  ): Promise<void> {
    // Collect available reference images, log warnings for any missing ones
    const imageReferences: ImageReference[] = [];

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

    const prompt = getImagePrompt(
      imageRequest.prompt,
      story.getImageInstructions()
    );
    const imageBuffer = await this.generateImage(
      prompt,
      imageReferences.length > 0 ? imageReferences : undefined,
      // Square is faster/cheaper than other sizes on gpt-image-1.x (allows medium
      // instead of low quality). On gpt-image-2.5, landscape/portrait use fewer tokens.
      imageRequest.imageSize || IMAGE_SIZES.SQUARE,
      imageRequest.imageQuality || IMAGE_GENERATION_BEAT_QUALITY,
      IMAGE_GENERATION_MODEL
    );

    await this.saveImageToStory(
      imageRequest.id,
      story.getId(),
      imageBuffer,
      imageRequest.subDir
    );
  }

  /**
   * Generates several in-game images in parallel. Failures are logged, not
   * thrown; with `saveToStoryState`, only the images that were written are
   * added to the returned story's image library.
   */
  async generateImagesForBeats(
    story: Story,
    imageRequests: ImageRequest[],
    saveToStoryState: boolean = true
  ): Promise<Story> {
    let updatedStory = story;

    // Generate images in parallel
    const imagePromises = imageRequests.map(async (imageRequest) => {
      try {
        await this.generateBeatImage(story, imageRequest);

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
