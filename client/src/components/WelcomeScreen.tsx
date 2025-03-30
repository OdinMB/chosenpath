import { useState } from "react";
import { AppTitle } from "./AppTitle";
import { Tooltip } from "./ui/Tooltip";
import { PrimaryButton } from "./ui/PrimaryButton";
import { Icons } from "./ui/Icons";
import { ConfirmDialog } from "./ui/ConfirmDialog";

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
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);

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
    setIsConfirmDialogOpen(true);
  };

  return (
    <div className="max-w-md mx-auto p-6 font-lora">
      <ConfirmDialog
        isOpen={isConfirmDialogOpen}
        onClose={() => setIsConfirmDialogOpen(false)}
        onConfirm={onDeleteCode}
        title="Delete Player Code"
        message="Are you sure you want to delete this player code? This cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
      />

      <AppTitle size="large" className="mb-2" />

      <div className="mb-8 text-primary-800">
        <p className="mb-2">
          Step into an interactive story where your choices shape the journey.
          Play solo or with friends. Create the stories you want, from space
          westerns to time travel romances.
        </p>
        <p>
          Everything is free during the alpha phase. Jump in and share your
          feedback!
        </p>
      </div>

      <div className="space-y-6">
        <PrimaryButton
          onClick={onNewStory}
          fullWidth
          size="lg"
          className="font-semibold"
        >
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
                      <Icons.Trash />
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
              <Icons.Globe />
            </a>
            <a
              href="https://www.linkedin.com/in/odinmuehlenbein/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center hover:text-primary-600"
            >
              <Icons.LinkedIn />
            </a>
          </div>
        </div>
        <p>Sonnenallee 50, 12045 Berlin</p>
      </footer>
    </div>
  );
}
