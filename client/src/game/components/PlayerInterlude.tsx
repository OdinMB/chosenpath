import { ClientStoryState, ImageUI } from "core/types";
import { createPlayerIdentityImage } from "shared/utils/imageUtils";
import { ClientStateManager } from "core/models/ClientStateManager";
import { ImageCard } from "shared/components/ImageCard";

interface PlayerInterludeProps {
  storyState: ClientStoryState;
  className?: string;
}

export function PlayerInterlude({
  storyState,
  className = "",
}: PlayerInterludeProps) {
  const stateManager = new ClientStateManager();
  const playerSlot = Object.keys(storyState.players)[0];
  const player = storyState.players[playerSlot];
  const storyIncludesImages = stateManager.includesImages(storyState);

  // Create player identity image if needed
  let playerIdentityImage: ImageUI | undefined = undefined;
  if (storyIncludesImages && player.identityChoice >= 0) {
    playerIdentityImage = createPlayerIdentityImage(
      playerSlot,
      player.identityChoice,
      storyState.templateId ? "template" : "story",
      storyState.templateId ? storyState.templateId : storyState.id
    );
  }

  return (
    <div
      className={`flex flex-col items-center justify-center px-4 md:px-6 ${className}`}
    >
      <div className="max-w-2xl w-full">
        {playerIdentityImage ? (
          <ImageCard
            imageRef={playerIdentityImage}
            title={player.name}
            size="large"
            className="mb-4"
          >
            <div className="text-left">
              <h2 className="text-xl font-semibold text-primary mb-3">
                {player.name}
              </h2>
              <p className="text-primary-600 mb-4">
                {player.pronouns.personal}/{player.pronouns.object}
              </p>

              <div className="text-primary-700 font-lora">
                {player.appearance && (
                  <p className="mb-2">{player.appearance}</p>
                )}
                {player.fluff && <p>{player.fluff}</p>}
              </div>
            </div>
          </ImageCard>
        ) : (
          <div className="bg-white rounded-lg shadow-md p-5 mb-4">
            <div className="text-left">
              <h2 className="text-xl font-semibold text-primary mb-3">
                {player.name}
              </h2>
              <p className="text-primary-600 mb-4">
                {player.pronouns.personal}/{player.pronouns.object}
              </p>

              <div className="text-primary-700 font-lora">
                {player.appearance && (
                  <p className="mb-2">{player.appearance}</p>
                )}
                {player.fluff && <p>{player.fluff}</p>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
