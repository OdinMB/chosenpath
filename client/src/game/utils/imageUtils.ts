import { ClientStoryState, PlayerSlot } from "core/types";
import { Image } from "core/types/image";

/**
 * Creates an image object for use with the StoryImage component
 * @param storyState The current story state
 * @param playerSlot The player slot
 * @param identityChoice The chosen identity index
 * @returns Image object compatible with StoryImage component
 */
export function createPlayerIdentityImage(
  storyState: ClientStoryState,
  playerSlot: PlayerSlot,
  identityChoice: number
): Image {
  return {
    id: `${playerSlot}_${identityChoice}`,
    fileType: "jpeg",
    subDirectory: "players",
    source: storyState.templateId ? "template" : "story",
    status: "ready",
  } as Image;
}
