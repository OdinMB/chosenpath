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
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Create Your Story</h1>
      
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label
            htmlFor="prompt"
            className="block text-lg font-semibold text-gray-900 mb-2"
          >
            What kind of story would you like to experience?
          </label>
          <textarea
            id="prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="w-full min-h-[120px] rounded-lg border border-gray-300 shadow-sm px-4 py-3 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-base"
            placeholder="For example: A cyberpunk detective story where I'm investigating a mysterious disappearance..."
            disabled={isLoading}
          />
        </div>

        <div className="flex items-center bg-gray-50 rounded-lg p-4">
          <input
            id="generate-images"
            type="checkbox"
            checked={generateImages}
            onChange={(e) => setGenerateImages(e.target.checked)}
            className="h-5 w-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            disabled={isLoading}
          />
          <label
            htmlFor="generate-images"
            className="ml-3 text-base text-gray-700"
          >
            Generate images for the story
          </label>
        </div>

        <button
          type="submit"
          disabled={isLoading || !prompt.trim()}
          className="w-full py-3 px-4 rounded-lg text-base font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-colors duration-200"
        >
          {isLoading ? (
            <span className="flex items-center justify-center">
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Creating Story...
            </span>
          ) : (
            "Create Story"
          )}
        </button>
      </form>
    </div>
  );
}
