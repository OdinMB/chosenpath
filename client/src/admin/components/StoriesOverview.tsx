import { useState, useEffect, useCallback } from "react";
import { PrimaryButton } from "../../components/ui/PrimaryButton.js";
import { Icons } from "../../components/ui/Icons.js";
import { config } from "../../config.js";
import { Logger } from "../../utils/logger.js";

type Story = {
  id: string;
  title: string;
  updatedAt: string;
  gameMode: string;
  playerCount: number;
  characterSelectionCompleted: boolean;
  maxTurns: number;
  fileSize: number;
  error?: string;
};

type StoriesOverviewProps = {
  token: string;
};

export const StoriesOverview = ({ token }: StoriesOverviewProps) => {
  const [stories, setStories] = useState<Story[]>([]);
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
    return new Date(dateString).toLocaleString();
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
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
          leftIcon={<Icons.ArrowRight className="h-4 w-4 rotate-90" />}
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
                <th className="py-3 px-4 text-left">Game Mode</th>
                <th className="py-3 px-4 text-left">Players</th>
                <th className="py-3 px-4 text-left">Last Updated</th>
                <th className="py-3 px-4 text-left">Size</th>
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
                        {story.characterSelectionCompleted ? (
                          <span className="ml-2 bg-accent-100 text-accent text-xs px-2 py-1 rounded">
                            In Progress
                          </span>
                        ) : (
                          <span className="ml-2 bg-primary-100 text-primary-700 text-xs px-2 py-1 rounded">
                            Setup
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-4 capitalize">
                    {story.gameMode.replace("-", " ")}
                  </td>
                  <td className="py-3 px-4">{story.playerCount}</td>
                  <td className="py-3 px-4">{formatDate(story.updatedAt)}</td>
                  <td className="py-3 px-4">
                    {formatFileSize(story.fileSize)}
                  </td>
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
