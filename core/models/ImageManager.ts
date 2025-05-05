import {
  StoryState,
  ImageStoryState,
  ImageInstructions,
  ImageReference,
} from "../types/index.js";

/**
 * Manages all image-related operations for Story class
 */
export class ImageManager {
  constructor(state: StoryState) {
    // Initialize if needed
  }

  /**
   * Get all images from the story
   */
  getImages(state: StoryState): ImageStoryState[] {
    return state.images;
  }

  getImage(state: StoryState, imageId: string): ImageStoryState | undefined {
    return state.images.find((image) => image.id === imageId);
  }

  /**
   * Add a new image to the story
   */
  addImage(state: StoryState, image: ImageStoryState): StoryState {
    return {
      ...state,
      images: [...state.images, image],
    };
  }

  /**
   * Update an existing image with new properties
   */
  updateImage(
    state: StoryState,
    imageId: string,
    updates: Partial<ImageStoryState>
  ): StoryState {
    return {
      ...state,
      images: state.images.map((image: ImageStoryState) =>
        image.id === imageId
          ? {
              ...image,
              ...updates,
            }
          : image
      ),
    };
  }

  getImageInstructions(state: StoryState): ImageInstructions {
    return state.imageInstructions;
  }

  getImageReferenceFromImageId(
    state: StoryState,
    imageId: string
  ): ImageReference | undefined {
    if (imageId.startsWith("player")) {
      return this.getImageReferenceFromPlayerSlot(state, imageId);
    }

    const imageStoryState: ImageStoryState | undefined = this.getImage(
      state,
      imageId
    );
    if (!imageStoryState) {
      console.error(`Image not found: ${imageId}`);
      return;
    }
    const sourceId =
      imageStoryState.source === "template" ? state.templateId : state.id;
    if (!sourceId) {
      throw new Error(`Invalid image source: ${imageStoryState.source}`);
    }
    return {
      id: imageStoryState.id,
      source: imageStoryState.source,
      sourceId: sourceId,
      fileType: "jpeg",
    };
  }

  getImageReferenceFromPlayerSlot(
    state: StoryState,
    playerSlot: string
  ): ImageReference {
    const playerIdentityIndex = state.players[playerSlot].identityChoice;
    if (playerIdentityIndex === undefined || playerIdentityIndex < -1) {
      throw new Error(
        `Player identity index not found for player slot: ${playerSlot}`
      );
    }
    return {
      id: playerSlot + "_" + playerIdentityIndex,
      source: state.templateId ? "template" : "story",
      sourceId: state.templateId ? state.templateId : state.id,
      subDirectory: "players",
      fileType: "jpeg",
    };
  }
}
