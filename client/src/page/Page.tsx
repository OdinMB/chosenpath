import { useState } from "react";
import { PrimaryButton, Icons } from "@components/ui";
import { StoryTemplate } from "@core/types";
import { TemplateCarousel } from "./components/TemplateCarousel.js";
import { StoredCodeSetsList } from "./components/StoredCodeSetsList";

interface PageProps {
  onCodeSubmit: (code: string) => void;
  onNewStory: () => void;
  onSelectTemplate?: (template: StoryTemplate) => void;
  onBrowseLibrary?: () => void;
}

export function Page({
  onCodeSubmit,
  onNewStory,
  onSelectTemplate,
  onBrowseLibrary,
}: PageProps) {
  const [code, setCode] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    onCodeSubmit(code.trim());
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCode(e.target.value.toUpperCase());
  };

  const handleSelectTemplate = (template: StoryTemplate) => {
    if (onSelectTemplate) {
      onSelectTemplate(template);
    }
  };

  return (
    <div className="max-w-md mx-auto p-6 font-lora">
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
        <StoredCodeSetsList onCodeSubmit={onCodeSubmit} />

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
