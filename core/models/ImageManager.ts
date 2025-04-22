import { Beat, StoryState, Image, PlayerSlot } from "../types/index.js";

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
  getImages(state: StoryState): Image[] {
    return state.images;
  }

  /**
   * Add a new image to the story
   */
  addImage(state: StoryState, image: Image): StoryState {
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
    updates: Partial<Image>
  ): StoryState {
    return {
      ...state,
      images: state.images.map((image: Image) =>
        image.id === imageId
          ? {
              ...image,
              ...updates,
              status: updates.url ? "ready" : image.status,
            }
          : image
      ),
    };
  }

  /**
   * Set the image for a player's current beat
   */
  setCurrentBeatImage(
    state: StoryState,
    playerSlot: PlayerSlot,
    imageId: string
  ): StoryState {
    const player = state.players[playerSlot];
    if (!player) return state;

    const currentTurn = player.beatHistory.length;
    if (currentTurn <= 0) return state;

    return {
      ...state,
      players: {
        ...state.players,
        [playerSlot]: {
          ...player,
          beatHistory: player.beatHistory.map((beat: Beat, index: number) =>
            index === player.beatHistory.length - 1
              ? { ...beat, imageId }
              : beat
          ),
        },
      },
    };
  }
}
