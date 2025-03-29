import { useState } from "react";
import { AppTitle } from "./AppTitle";
import { Tooltip } from "./ui/Tooltip";
import { PrimaryButton } from "./ui/PrimaryButton";

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
      <AppTitle size="large" className="mb-4" />

      <div className="bg-accent/10 border border-accent/20 rounded-lg p-4 mb-8 text-sm text-primary-800">
        <p className="mb-2">
          Step into an <strong>interactive story</strong> where your choices
          shape the journey. <strong>Create the stories you want</strong>, from
          space westerns to time travel romances.{" "}
          <strong>Play solo or with friends</strong>.
        </p>
        <p>
          Everything is free during the alpha phase. Jump into a story and share
          your feedback!
        </p>
      </div>

      <div className="space-y-6">
        <PrimaryButton onClick={onNewStory} fullWidth size="lg">
          Start A New Story
        </PrimaryButton>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-primary-100"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-white text-primary-600">or</span>
          </div>
        </div>

        {existingPlayerCode && (
          <>
            <div className="flex flex-col gap-3">
              <div className="w-full flex items-center justify-between gap-3">
                <div className="flex-1 h-10 px-4 py-2 border rounded-lg border-primary-100 bg-white text-primary shadow-sm flex items-center opacity-75">
                  {existingPlayerCode}
                </div>
                <div className="flex gap-3 items-center">
                  <PrimaryButton onClick={handleResume}>Resume</PrimaryButton>
                  <Tooltip content="Delete code" position="bottom">
                    <button
                      onClick={handleDeleteClick}
                      className="text-red-600 hover:text-red-700 focus:outline-none flex items-center"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-5 w-5"
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
          <div className="flex flex-row gap-3 w-full">
            <input
              id="code"
              type="text"
              value={code}
              onChange={handleInputChange}
              className="flex-grow min-w-0 h-10 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-accent focus:border-accent border-primary-100 bg-white text-primary shadow-sm placeholder-primary-400"
              placeholder="Story code"
            />

            <PrimaryButton
              type="submit"
              disabled={!code.trim()}
              className="whitespace-nowrap min-w-[90px]"
            >
              Join Game
            </PrimaryButton>
          </div>
        </form>
      </div>

      <footer className="mt-12 pt-4 border-t border-primary-100 text-xs text-primary-400">
        <p className="mb-2">
          Looking for collaborators. Are you a writer, storyteller, designer, or
          world simulation architect? Reach out!
        </p>

        <div className="flex items-center gap-2 mb-1">
          <span>Odin Mühlenbein</span>
          <div className="flex gap-2 ml-1">
            <a
              href="https://odin.muehlenbein.de"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center hover:text-primary-600"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="w-4 h-4 text-primary-500"
              >
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM4 12c0-1.95.7-3.74 1.87-5.13L9 10v1c0 1.1.9 2 2 2v2H9v3.13c-2.5-1.33-5-4.08-5-6.13zm11.5 7.28c-.76.17-1.57.28-2.4.28-1.19 0-2.31-.22-3.35-.62L12 17l1.1-2h3.63c.57 0 1.1.17 1.55.45l1.43 1.43c-.17.82-.47 1.58-.87 2.28L18 20c-.59.59-1.59 0-1.59 0-.25-.25-.15-.54-.15-.72.05-.71.62-1.13.62-1.13.11-.11.13-.27.03-.4-.34-.4-.67-.82-.97-1.25-.04-.06-.08-.12-.1-.19-.06-.16-.16-.33-.05-.5.11-.17.31-.18.49-.11l.34.13c.27.1.52.25.72.44.18-.15.38-.29.58-.4.18-.1.39-.2.26-.45-.12-.23-.42-.23-.51-.42-.09-.19.22-.35.22-.35.25-.15.51-.26.78-.35-.32-.4-.49-.89-.49-1.42 0-1.25 1.01-2.25 2.25-2.25 1.06 0 1.93.85 2.06 2 .12-.05.2-.18.2-.34 0-.25-.09-.44-.19-.62.47-.75 1.1-1.38 1.87-1.9-.17-.07-.32-.15-.42-.25-.32-.3-.67-.31-.67-.31-.31-.32-.52-.76-.54-1.25l2.81 2.81c.95 1.27 1.52 2.86 1.52 4.58 0 2.46-1.12 4.61-2.86 6.07-.99-1.08-2.28-1.61-2.28-1.61-.19-.13-.34.11-.34.11z" />
              </svg>
            </a>
            <a
              href="https://www.linkedin.com/in/odinmuehlenbein/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center hover:text-primary-600"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="w-4 h-4 text-primary-500"
              >
                <path d="M20.5 2h-17A1.5 1.5 0 002 3.5v17A1.5 1.5 0 003.5 22h17a1.5 1.5 0 001.5-1.5v-17A1.5 1.5 0 0020.5 2zM8 19H5v-9h3zM6.5 8.25A1.75 1.75 0 118.3 6.5a1.78 1.78 0 01-1.8 1.75zM19 19h-3v-4.74c0-1.42-.6-1.93-1.38-1.93A1.74 1.74 0 0013 14.19a.66.66 0 000 .14V19h-3v-9h2.9v1.3a3.11 3.11 0 012.7-1.4c1.55 0 3.36.86 3.36 3.66z" />
              </svg>
            </a>
          </div>
        </div>
        <p>Sonnenallee 50, 12045 Berlin</p>
      </footer>
    </div>
  );
}
