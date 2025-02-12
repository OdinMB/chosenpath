import { useState } from "react";
import { useStory } from "../hooks/useStory";

interface StoryInitializerProps {
  onSetup: (prompt: string, generateImages: boolean) => void;
}

export function StoryInitializer({ onSetup }: StoryInitializerProps) {
  const [prompt, setPrompt] = useState("");
  const [generateImages, setGenerateImages] = useState(false);
  const { isLoading } = useStory();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;
    onSetup(prompt.trim(), generateImages);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label
          htmlFor="prompt"
          className="block text-sm font-medium text-gray-700"
        >
          Story Prompt
        </label>
        <textarea
          id="prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
          rows={4}
          placeholder="Enter your story prompt..."
          disabled={isLoading}
        />
      </div>

      <div className="flex items-center">
        <input
          id="generate-images"
          type="checkbox"
          checked={generateImages}
          onChange={(e) => setGenerateImages(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          disabled={isLoading}
        />
        <label
          htmlFor="generate-images"
          className="ml-2 block text-sm text-gray-900"
        >
          Generate images
        </label>
      </div>

      <button
        type="submit"
        disabled={isLoading || !prompt.trim()}
        className="inline-flex justify-center rounded-md border border-transparent bg-indigo-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
      >
        {isLoading ? "Creating Story..." : "Create Story"}
      </button>
    </form>
  );
}
