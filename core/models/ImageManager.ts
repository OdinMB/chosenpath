import {
  StoryState,
  ImageStoryState,
  ImageInstructions,
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
}
