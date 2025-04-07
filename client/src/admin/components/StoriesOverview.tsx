import { useState, useEffect, useCallback } from "react";
import { PrimaryButton } from "../../shared/components/ui/PrimaryButton.js";
import { Icons } from "../../shared/components/ui/Icons.js";
import { config } from "../../config.js";
import { Logger } from "../../shared/logger.js";

type StoryListItem = {
  id: string;
  title: string;
  updatedAt: string;
  createdAt?: string;
  gameMode: string;
  playerCount: number;
  characterSelectionCompleted: boolean;
  maxTurns: number;
  error?: string;
  currentBeat?: number;
};

type StoriesOverviewProps = {
  token: string;
};

export const StoriesOverview = ({ token }: StoriesOverviewProps) => {
  const [stories, setStories] = useState<StoryListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStories = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    Logger.Admin.log("Loading stories list");

    try {
      const response = await fetch(`${config.apiUrl}/admin/stories`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        Logger.Admin.error("Server returned an error response", {
          status: response.status,
          statusText: response.statusText,
        });
        throw new Error("Failed to load stories");
      }

      const data = await response.json();
      Logger.Admin.log(`Successfully loaded ${data.stories.length} stories`);
      setStories(data.stories);
    } catch (error) {
      Logger.Admin.error("Failed to load stories", error);
      setError("Failed to load stories. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadStories();
  }, [loadStories]);

  const formatDate = (dateString: string) => {
    if (!dateString) return "Unknown";

    const date = new Date(dateString);

    // Format: "2025-04-07, 9:34pm"
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    let hours = date.getHours();
    const ampm = hours >= 12 ? "pm" : "am";
    hours = hours % 12;
    hours = hours ? hours : 12; // Convert 0 to 12
    const minutes = String(date.getMinutes()).padStart(2, "0");

    return `${year}-${month}-${day}, ${hours}:${minutes}${ampm}`;
  };

  const handleDeleteStory = async (storyId: string) => {
    if (
      !confirm(
        "Are you sure you want to delete this story? This action cannot be undone."
      )
    ) {
      Logger.Admin.log(`Delete operation canceled for story: ${storyId}`);
      return;
    }

    Logger.Admin.log(`Attempting to delete story: ${storyId}`);
    try {
      const response = await fetch(
        `${config.apiUrl}/admin/stories/${storyId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        Logger.Admin.error(`Failed to delete story: ${storyId}`, {
          status: response.status,
          statusText: response.statusText,
        });
        throw new Error("Failed to delete story");
      }

      Logger.Admin.log(`Successfully deleted story: ${storyId}`);
      // Refresh the list
      loadStories();
    } catch (error) {
      Logger.Admin.error(`Error deleting story: ${storyId}`, error);
      setError("Failed to delete story. Please try again.");
    }
  };

  return (
    <div className="bg-gray-50 p-6 rounded-lg">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold text-secondary">Stored Stories</h2>
        <PrimaryButton
          onClick={loadStories}
          size="sm"
          disabled={isLoading}
          leftIcon={<Icons.Refresh className="h-4 w-4" />}
        >
          Refresh
        </PrimaryButton>
      </div>

      {error && (
        <div className="mb-4 flex items-center rounded-md bg-tertiary-100 p-4 text-sm text-tertiary">
          <Icons.Error className="mr-2 h-5 w-5" />
          <span>{error}</span>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-t-2 border-b-2 border-secondary rounded-full animate-spin"></div>
        </div>
      ) : stories.length === 0 ? (
        <div className="text-center py-12 text-primary-500">
          No stories found.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white rounded-lg overflow-hidden shadow">
            <thead className="bg-gray-100 text-primary-800">
              <tr>
                <th className="py-3 px-4 text-left">Title</th>
                <th className="py-3 px-4 text-left">Players</th>
                <th className="py-3 px-4 text-left">Game Mode</th>
                <th className="py-3 px-4 text-left">Beat</th>
                <th className="py-3 px-4 text-left">Created</th>
                <th className="py-3 px-4 text-left">Last Updated</th>
                <th className="py-3 px-4 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {stories.map((story) => (
                <tr key={story.id} className="hover:bg-gray-50">
                  <td className="py-3 px-4">
                    {story.error ? (
                      <span className="text-tertiary">{story.title}</span>
                    ) : (
                      <div>
                        <span className="font-medium">{story.title}</span>
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-4">{story.playerCount}</td>
                  <td className="py-3 px-4 capitalize">
                    {story.gameMode.replace("-", " ")}
                  </td>
                  <td className="py-3 px-4">
                    {story.characterSelectionCompleted
                      ? story.currentBeat || 1
                      : 0}{" "}
                    / {story.maxTurns}
                  </td>
                  <td className="py-3 px-4">
                    {formatDate(story.createdAt || story.updatedAt)}
                  </td>
                  <td className="py-3 px-4">{formatDate(story.updatedAt)}</td>
                  <td className="py-3 px-4">
                    <div className="flex space-x-2">
                      <button
                        onClick={() => handleDeleteStory(story.id)}
                        className="text-tertiary hover:text-tertiary-700 transition-colors"
                        title="Delete story"
                      >
                        <Icons.Trash className="h-5 w-5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
