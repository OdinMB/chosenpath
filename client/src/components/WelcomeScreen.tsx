import { useState } from "react";
import { AppTitle } from "./AppTitle";

interface WelcomeScreenProps {
  onCodeSubmit: (code: string) => void;
  onNewStory: () => void;
  existingPlayerCode: string | null;
  onDeleteCode: () => void;
}

export function WelcomeScreen({
  onCodeSubmit,
  onNewStory,
  existingPlayerCode,
  onDeleteCode,
}: WelcomeScreenProps) {
  const [code, setCode] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    onCodeSubmit(code.trim());
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCode(e.target.value.toUpperCase());
  };

  const handleResume = () => {
    if (existingPlayerCode) {
      onCodeSubmit(existingPlayerCode);
    }
  };

  const handleDeleteClick = () => {
    if (
      window.confirm(
        "Are you sure you want to delete this player code? This cannot be undone."
      )
    ) {
      onDeleteCode();
    }
  };

  return (
    <div className="max-w-md mx-auto p-6 font-lora">
      <AppTitle size="large" className="mb-10" />

      <div className="space-y-6">
        {existingPlayerCode && (
          <>
            <div className="flex flex-row gap-3">
              <div className="flex-1 h-10 px-4 py-2 border rounded-lg bg-gray-100 font-mono text-sm text-gray-800 flex items-center">
                {existingPlayerCode}
              </div>
              <button
                onClick={handleResume}
                className="h-10 py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 whitespace-nowrap flex-shrink-0"
              >
                Resume Story
              </button>
              <button
                onClick={handleDeleteClick}
                className="h-10 py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 whitespace-nowrap flex-shrink-0"
              >
                Delete
              </button>
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">or</span>
              </div>
            </div>
          </>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-row gap-3">
            <input
              id="code"
              type="text"
              value={code}
              onChange={handleInputChange}
              className="flex-1 h-10 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
              placeholder="Enter your player code"
            />

            <button
              type="submit"
              disabled={!code.trim()}
              className="h-10 py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap flex-shrink-0"
            >
              Join Game
            </button>
          </div>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-white text-gray-500">or</span>
          </div>
        </div>

        <button
          onClick={onNewStory}
          className="w-full h-10 py-2 px-4 border-2 border-indigo-600 rounded-md shadow-sm text-sm font-medium text-indigo-600 bg-white hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        >
          Start New Story
        </button>
      </div>
    </div>
  );
}
