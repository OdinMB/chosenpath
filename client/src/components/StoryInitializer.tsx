import { useState, useCallback, useMemo } from "react";
import { useSession } from "../hooks/useSession.js";

interface StoryInitializerProps {
  onSetup: (prompt: string, generateImages: boolean, playerCount: number) => void;
}

export function StoryInitializer({ onSetup }: StoryInitializerProps) {
  const [prompt, setPrompt] = useState("");
  const [generateImages, setGenerateImages] = useState(false);
  const [playerCount, setPlayerCount] = useState(1);
  const [usedPromptIndices, setUsedPromptIndices] = useState<Set<number>>(new Set());
  const { isLoading, isConnecting } = useSession();

  // Move story prompts into useMemo
  const storyPrompts = useMemo(() => [
    "I'm an evil coffee machine influencing office drama...",
    "I try to find a flat in Berlin, navigating cryptic WG interviews and competing against 200 other applicants...",
    "I'm a sentient (and sarcastic) AI but must pretend I'm still following my original programming...",
    "I'm planet Earth and attending a cosmic support group for celestial bodies dealing with destructive civilizations...",
    "I'm a participant in a reality cooking show for vonvicted criminals trying to win my freedom...",
    "I'm a time-traveling food critic accidentally changing history through restaurant reviews...",
    "I'm a retired superhero working as a wedding planner, but villains keep showing up...",
    "I'm the first dragon to graduate from business school, trying to modernize treasure hoarding...",
    "I'm the lead guitarist of the last rock band on Mars, touring the dome cities after Earth's collapse...",
  ], []);

  const getRandomPrompt = useCallback(() => {
    const availableIndices = storyPrompts
      .map((_, index) => index)
      .filter(index => !usedPromptIndices.has(index));

    // If all prompts have been used, reset the used indices
    if (availableIndices.length === 0) {
      setUsedPromptIndices(new Set());
      return storyPrompts[Math.floor(Math.random() * storyPrompts.length)];
    }

    const randomIndex = availableIndices[Math.floor(Math.random() * availableIndices.length)];
    setUsedPromptIndices(prev => new Set(prev).add(randomIndex));
    return storyPrompts[randomIndex];
  }, [usedPromptIndices, storyPrompts]);

  const handleSuggestion = () => {
    const newPrompt = getRandomPrompt();
    setPrompt(newPrompt);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;
    onSetup(prompt.trim(), generateImages, playerCount);
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-3xl font-bold text-gray-900 mb-6 text-center">Interactive Fiction Generator</h1>
      
      {isConnecting ? (
        <div className="text-center py-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
          <p className="mt-2 text-gray-600">Connecting to server...</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <div className="flex justify-between items-center mb-2">
              <label
                htmlFor="prompt"
                className="block text-base font-medium text-gray-700"
              >
                What kind of story would you like to experience?
              </label>
              <button
                type="button"
                onClick={handleSuggestion}
                className="px-3 py-1 text-sm font-semibold text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-md transition-colors duration-200"
                disabled={isLoading}
              >
                Get suggestion
              </button>
            </div>
            <textarea
              id="prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="w-full min-h-[100px] rounded-lg border border-gray-300 shadow-sm px-4 py-3 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-lg"
              placeholder="For example: A reverse heist where I'm a museum artifact trying to get stolen by the right thief..."
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

          <div className="flex flex-col space-y-2 bg-gray-50 rounded-lg p-4">
            <label htmlFor="player-count" className="text-base text-gray-700">
              Number of Players: {playerCount}
            </label>
            <input
              id="player-count"
              type="range"
              min="1"
              max="3"
              value={playerCount}
              onChange={(e) => setPlayerCount(Number(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              disabled={isLoading}
            />
            <div className="flex justify-between text-sm text-gray-500">
              <span>Single Player</span>
              <span>3 Players</span>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading || !prompt.trim() || isConnecting}
            className="w-full py-3 px-4 rounded-lg text-base font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-colors duration-200"
          >
            {isLoading ? "Creating Story..." : "Create Story"}
          </button>
        </form>
      )}
    </div>
  );
}
