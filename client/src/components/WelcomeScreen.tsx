import { useState } from "react";
import { AppTitle } from "./AppTitle";
import { Tooltip } from "./ui/Tooltip";

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
            <div className="flex flex-col gap-3">
              <div className="w-full flex items-center justify-between gap-3">
                <div className="flex-1 h-10 px-4 py-2 border rounded-lg border-primary-100 bg-white text-primary shadow-sm font-mono flex items-center opacity-75">
                  {existingPlayerCode}
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={handleResume}
                    className="h-10 py-2 px-4 border-l-8 border border-accent rounded-lg shadow-md text-sm font-semibold text-primary bg-white hover:border-l-8 hover:border-secondary hover:shadow-lg hover:translate-x-1 transition-all duration-300 whitespace-nowrap flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-opacity-50"
                  >
                    Resume
                  </button>
                  <Tooltip content="Delete code" position="bottom">
                    <button
                      onClick={handleDeleteClick}
                      className="h-10 py-2 px-4 rounded-lg text-sm font-medium text-primary bg-white border border-primary-100 hover:bg-primary-50 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-opacity-50 transition-colors duration-200 shadow-sm flex items-center gap-2"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-4 w-4 text-red-600"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                  </Tooltip>
                </div>
              </div>
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-primary-100"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-primary-600">or</span>
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
              className="flex-1 h-10 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-accent focus:border-accent border-primary-100 bg-white text-primary shadow-sm font-mono placeholder-primary-400"
              placeholder="Enter your 6-letter code"
            />

            <button
              type="submit"
              disabled={!code.trim()}
              className="h-10 py-2 px-4 border-l-8 border border-accent rounded-lg shadow-md text-sm font-semibold text-primary bg-white hover:enabled:border-l-8 hover:enabled:border-secondary hover:enabled:shadow-lg hover:enabled:translate-x-1 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-opacity-50"
            >
              Join Game
            </button>
          </div>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-primary-100"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-white text-primary-600">or</span>
          </div>
        </div>

        <button
          onClick={onNewStory}
          className="w-full py-3 px-4 border-l-8 border border-accent rounded-lg shadow-md text-base font-semibold text-primary bg-white hover:enabled:border-l-8 hover:enabled:border-secondary hover:enabled:shadow-lg hover:enabled:translate-x-1 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-opacity-50 transition-all duration-300"
        >
          Start New Story
        </button>
      </div>
    </div>
  );
}
