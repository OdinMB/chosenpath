import React from "react";
import { useLoaderData } from "react-router-dom";
import { UserStoriesList } from "./components/UserStoriesList";
import { ExtendedStoryMetadata } from "core/types/api";
import { Logger } from "shared/logger";

export const Users: React.FC = () => {
  // Data is now coming from the loader
  const allUserStories = useLoaderData() as ExtendedStoryMetadata[];

  Logger.App.log(
    "Users component rendered, stories from loader:",
    allUserStories.length
  );

  // For now, we'll pass all stories directly.
  // We might need to transform or filter this data later or separate codes.
  // The UserStoriesList currently expects storyCodes and stories separately.
  // The loader provides ExtendedStoryMetadata which includes player (code) information.

  // We need to prepare storyCodes and stories as expected by UserStoriesList
  // This logic is similar to what was in useUserStories.ts
  const storyCodes = allUserStories.flatMap((story) =>
    story.players
      ? story.players.map((player) => ({
          userId: player.userId || "",
          storyId: player.storyId,
          playerSlot: player.playerSlot,
          code: player.code,
          createdAt: story.createdAt,
          lastPlayedAt: player.lastPlayedAt || story.updatedAt,
        }))
      : []
  );

  const stories = allUserStories.map((story) => {
    const { players, ...storyMetadata } = story; // eslint-disable-line @typescript-eslint/no-unused-vars
    return storyMetadata;
  });

  const handleCodeSelect = (code: string) => {
    Logger.App.log("Story code selected:", code);
    // Handle navigation or other actions when a story code is selected
    // This might involve navigating to a game play page, e.g.:
    // navigate(`/play/${code}`);
  };

  return (
    <div className="container mx-auto p-4">
      <h2 className="text-2xl font-semibold mb-6 text-gray-800">My Stories</h2>
      <UserStoriesList
        stories={stories}
        storyCodes={storyCodes}
        onCodeSelect={handleCodeSelect}
      />
    </div>
  );
};
