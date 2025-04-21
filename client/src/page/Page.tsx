import { useState, useEffect } from "react";
import { ConfirmDialog, Icons, PrimaryButton, Tooltip } from "@components/ui";
import { useSession } from "@common/useSession";
import { StoredCodeSet } from "@common/SessionContext";
import { StoryTemplate } from "@core/types";
import { TemplateCarousel } from "./components/TemplateCarousel.js";
import {
  getSortedCodeSets,
  deleteStoredCodeSet,
} from "../shared/codeSetUtils.ts";
import { Logger } from "../shared/logger.js";

interface PageProps {
  onCodeSubmit: (code: string) => void;
  onNewStory: () => void;
  onSelectTemplate?: (template: StoryTemplate) => void;
  onBrowseLibrary?: () => void;
}

// Helper function to format timestamp
function formatDate(timestamp: number): string {
  const date = new Date(timestamp);

  // Format the date as "Month Day"
  const monthName = date.toLocaleString("en-US", { month: "long" });
  const day = date.getDate();

  // Format the time
  const time = date.toLocaleString(undefined, { timeStyle: "short" });

  return `${monthName} ${day}, ${time}`;
}

// Helper function to format player label
function formatPlayerLabel(player: string, isFirstPlayer: boolean): string {
  if (isFirstPlayer) {
    return "You";
  }

  // Convert "player1" to "Player 1"
  const match = player.match(/player(\d+)/i);
  if (match && match[1]) {
    return `Player ${match[1]}`;
  }

  return player;
}

export function Page({
  onCodeSubmit,
  onNewStory,
  onSelectTemplate,
  onBrowseLibrary,
}: PageProps) {
  const [code, setCode] = useState("");
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);
  const [codeSetToDelete, setCodeSetToDelete] = useState<number | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [codeSets, setCodeSets] = useState<StoredCodeSet[]>(
    getSortedCodeSets()
  );

  const { refreshStoredCodeSets } = useSession();

  // Refresh UI when code sets change
  const refreshLocalCodeSets = () => {
    setCodeSets(getSortedCodeSets());
    refreshStoredCodeSets();
  };

  // Clear copied status after 2 seconds
  useEffect(() => {
    if (copiedCode) {
      const timer = setTimeout(() => {
        setCopiedCode(null);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [copiedCode]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    onCodeSubmit(code.trim());
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCode(e.target.value.toUpperCase());
  };

  const handleDeleteCodeSet = (timestamp: number) => {
    setCodeSetToDelete(timestamp);
    setIsConfirmDialogOpen(true);
  };

  const handleJoinWithCodeSet = (codeSet: StoredCodeSet) => {
    // Play button defaults to first code - individual codes can be clicked directly
    const firstCode = Object.values(codeSet.codes)[0];
    if (firstCode) {
      Logger.UI.log("Joining game with code from stored code set");
      onCodeSubmit(firstCode);
    }
  };

  const confirmDelete = () => {
    if (codeSetToDelete !== null) {
      // Use the utility function directly
      if (deleteStoredCodeSet(codeSetToDelete)) {
        Logger.UI.log("Successfully deleted code set");
      } else {
        Logger.UI.warn("Failed to delete code set");
      }

      // Refresh both local and context state
      refreshLocalCodeSets();

      // Reset deletion state
      setCodeSetToDelete(null);
      setIsConfirmDialogOpen(false);
    }
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
  };

  const handleSelectTemplate = (template: StoryTemplate) => {
    if (onSelectTemplate) {
      onSelectTemplate(template);
    }
  };

  return (
    <div className="max-w-md mx-auto p-6 font-lora">
      <ConfirmDialog
        isOpen={isConfirmDialogOpen}
        onClose={() => setIsConfirmDialogOpen(false)}
        onConfirm={confirmDelete}
        title="Delete Story Codes"
        message="Are you sure you want to delete these story codes? This cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
      />

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
        {/* Stored Code Sets */}
        {codeSets.length > 0 && (
          <>
            <div className="flex flex-col gap-3">
              {codeSets.map((codeSet) => {
                return (
                  <div
                    key={codeSet.timestamp}
                    className="w-full flex items-center justify-between gap-3 border rounded-lg border-primary-100 p-3 mt-2"
                  >
                    <div className="flex-1">
                      <div className="text-sm font-medium text-primary-700">
                        {codeSet.title ||
                          `Story from ${formatDate(codeSet.timestamp)}`}
                      </div>
                      <div className="text-xs text-primary-500 mt-1 space-y-1">
                        {Object.entries(codeSet.codes).length === 1 ? (
                          // If only one code, display it without labels
                          <div className="flex items-center">
                            <span className="font-mono bg-gray-50 px-1.5 py-0.5 rounded border border-primary-100">
                              {Object.values(codeSet.codes)[0]}
                            </span>
                          </div>
                        ) : (
                          // If multiple codes, display with proper labels
                          Object.entries(codeSet.codes).map(
                            ([player, code], index) => (
                              <div key={player} className="flex items-center">
                                <span className="font-medium text-primary-600 mr-2">
                                  {formatPlayerLabel(player, index === 0)}:
                                </span>
                                <span className="font-mono bg-gray-50 px-1.5 py-0.5 rounded border border-primary-100">
                                  {code}
                                </span>
                                {index !== 0 && (
                                  <button
                                    onClick={() => handleCopyCode(code)}
                                    className="ml-1 text-primary-400 hover:text-primary-600"
                                    title="Copy code"
                                  >
                                    <Icons.Clipboard className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                {copiedCode === code && (
                                  <span className="ml-2 text-xs text-green-500 animate-fadeIn">
                                    Copied!
                                  </span>
                                )}
                              </div>
                            )
                          )
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 items-center">
                      <PrimaryButton
                        size="sm"
                        onClick={() => handleJoinWithCodeSet(codeSet)}
                      >
                        {codeSet.lastActive ? "Resume" : "Play"}
                      </PrimaryButton>
                      <Tooltip content="Delete codes" position="bottom">
                        <button
                          onClick={() => handleDeleteCodeSet(codeSet.timestamp)}
                          className="text-red-600 hover:text-red-700 focus:outline-none flex items-center"
                        >
                          <Icons.Trash />
                        </button>
                      </Tooltip>
                    </div>
                  </div>
                );
              })}
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

        <PrimaryButton
          onClick={onNewStory}
          fullWidth
          size="lg"
          className="font-semibold"
        >
          Create Your Own Story
        </PrimaryButton>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-primary-100"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-white text-primary-600">or</span>
          </div>
        </div>

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

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-primary-100"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-white text-primary-600">or</span>
          </div>
        </div>

        <TemplateCarousel onPlay={handleSelectTemplate} />

        {onBrowseLibrary && (
          <PrimaryButton onClick={onBrowseLibrary} fullWidth size="lg">
            Browse Our Library
          </PrimaryButton>
        )}
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
