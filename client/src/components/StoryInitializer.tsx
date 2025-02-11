import { useState } from "react";
import { useStory } from "../contexts/StoryContext";

interface StoryInitializerProps {
  onSetup: (prompt: string, generateImages: boolean) => Promise<void>;
}

export function StoryInitializer({ onSetup }: StoryInitializerProps) {
  const [prompt, setPrompt] = useState("");
  const [generateImages, setGenerateImages] = useState(false);
  const { isLoading } = useStory();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;
    await onSetup(prompt.trim(), generateImages);
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Start Your Story</h1>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block mb-2">
            Describe your story:
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={isLoading}
              className="w-full p-3 border rounded mt-1"
              rows={4}
              placeholder="Enter a prompt for your story..."
            />
          </label>
        </div>

        <div>
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={generateImages}
              onChange={(e) => setGenerateImages(e.target.checked)}
              disabled={isLoading}
              className="form-checkbox"
            />
            <span>Generate images for each beat</span>
          </label>
        </div>

        <button
          type="submit"
          disabled={isLoading || !prompt.trim()}
          className="w-full py-2 px-4 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {isLoading ? "Creating Story..." : "Start Story"}
        </button>
      </form>
    </div>
  );
}
