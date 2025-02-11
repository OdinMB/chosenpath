import { useState } from "react";
import { useStory } from "../context/storyContext";

interface Props {
  onSetup: (prompt: string, generateImages: boolean) => void;
}

export function StoryInitializer({ onSetup }: Props) {
  const [prompt, setPrompt] = useState("");
  const [generateImages, setGenerateImages] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { setIsLoading, isLoading } = useStory();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    setError(null);
    setIsLoading(true);

    try {
      onSetup(prompt, generateImages);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to initialize story"
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <form onSubmit={handleSubmit}>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          className="w-full p-4 border border-gray-300 rounded-lg mb-4 resize-vertical
                   focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          rows={4}
          placeholder="Enter your story prompt..."
        />

        <div className="mb-4 flex items-center">
          <input
            type="checkbox"
            id="generateImages"
            checked={generateImages}
            onChange={(e) => setGenerateImages(e.target.checked)}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
          <label htmlFor="generateImages" className="ml-2 text-gray-700">
            Generate images?
          </label>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <button
          type="submit"
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded
                   disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          disabled={!prompt.trim() || isLoading}
        >
          {isLoading ? "Creating Story..." : "Start Story"}
        </button>
      </form>
    </div>
  );
}
