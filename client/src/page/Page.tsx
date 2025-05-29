import { useState, useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { PrimaryButton, Icons } from "components/ui";
import { TemplateMetadata } from "core/types";
import { TemplateCarousel } from "./components/TemplateCarousel.js";
import { OrDivider, LibraryCategoryGrid } from "./components";
import {
  NewsletterButton,
  NewsletterModal,
  useNewsletter,
} from "resources/newsletter";
import { DiscordButton } from "shared/components";
import { ResumableStories } from "resources/stories/ResumableStories.js";
import { useAuth } from "client/shared/auth/useAuth.js";
import { Logger } from "shared/logger";
import { config } from "../config";

// Page component refactored to use React Router
export function Page() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [code, setCode] = useState("");
  const {
    isNewsletterModalOpen,
    openNewsletterModal,
    closeNewsletterModal,
    handleSubscribe,
  } = useNewsletter();

  const [showResumableSection, setShowResumableSection] = useState(true);
  const previousUserIdRef = useRef<string | undefined | null>(user?.id);

  useEffect(() => {
    const currentUserId = user?.id;
    if (previousUserIdRef.current !== currentUserId) {
      Logger.App.debug(
        `Page.tsx: User changed (effect). Prev: ${previousUserIdRef.current}, Curr: ${currentUserId}. Forcing showResumableSection to true.`
      );
      setShowResumableSection(true);
    }
    previousUserIdRef.current = currentUserId;
  }, [user?.id]);

  const handleResumableContent = useCallback(
    (hasContent: boolean) => {
      setShowResumableSection(hasContent);
    },
    [setShowResumableSection]
  );

  const handleJoinGame = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    navigate(`/game/${code}`);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCode(e.target.value.toUpperCase());
  };

  // Navigate to setup page for new story
  const handleNewStory = () => {
    navigate("/setup");
  };

  // Navigate to template configuration
  const handleSelectTemplate = (template: TemplateMetadata) => {
    navigate(`/templates/${template.id}/configure`);
  };

  // Navigate to library with optional category tag
  const handleBrowseWithCategory = (categoryTag?: string) => {
    if (categoryTag) {
      navigate(`/library?tags=${categoryTag}`);
    } else {
      navigate("/library");
    }
  };

  return (
    <>
      <div className="max-w-md mx-auto p-4 font-lora">
        <div className="mb-8 text-primary-800">
          <p className="mb-2">
            Dive into immersive stories. Play alone or invite friends to shape
            the story with multiple characters — whether you're exploring
            distant galaxies or serving croissants in a Parisian café.
          </p>
          <p>
            Everything is free during the beta phase. No account required
            (unless you want to use advanced{" "}
            <a
              href="/for-storytellers"
              onClick={(e) => {
                e.preventDefault();
                navigate("/for-storytellers");
              }}
              className="text-link"
            >
              storytelling features
            </a>
            ). Jump in, share your feedback, and say hello on{" "}
            <a
              href={config.discordUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-link"
            >
              Discord
            </a>
            !
          </p>
        </div>

        <div className="space-y-6">
          {showResumableSection && (
            <>
              <ResumableStories
                key={user?.id || "loggedOut"}
                onSetHasContent={handleResumableContent}
                forceSingleColumn={true}
              />
              <OrDivider />
            </>
          )}

          <PrimaryButton
            onClick={handleNewStory}
            fullWidth
            size="lg"
            className="font-semibold"
          >
            Create Your Own Story
          </PrimaryButton>

          <OrDivider />

          <LibraryCategoryGrid onBrowseLibrary={handleBrowseWithCategory} />

          <OrDivider />

          <form onSubmit={handleJoinGame} className="space-y-4">
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

          <OrDivider />

          {/* TemplateCarousel likely fetches its own templates or uses a global state */}
          <TemplateCarousel onPlay={handleSelectTemplate} />
        </div>

        {/* Newsletter Modal */}
        <NewsletterModal
          isOpen={isNewsletterModalOpen}
          onClose={closeNewsletterModal}
          onSubmit={handleSubscribe}
        />

        <footer className="mt-12 pt-4 border-t border-primary-100 text-xs text-primary-400">
          <div className="mb-4 flex items-center gap-4">
            <NewsletterButton onClick={openNewsletterModal} />
            <DiscordButton />
          </div>

          <p className="mb-2">
            Looking for collaborators. Are you a writer, storyteller, designer,
            or world builder? Reach out!
          </p>

          <div className="flex items-center gap-2 mb-2">
            <span>Odin Mühlenbein</span>
            <div className="flex gap-2">
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
            <span>Sonnenallee 50, 12045 Berlin</span>
          </div>
          <div>
            <a
              href="/for-storytellers"
              onClick={(e) => {
                e.preventDefault();
                navigate("/for-storytellers");
              }}
              className="footer-link mr-3"
            >
              For Storytellers
            </a>
            <a
              href="/privacy"
              onClick={(e) => {
                e.preventDefault();
                navigate("/privacy");
              }}
              className="footer-link mr-3"
            >
              Privacy
            </a>
            <a
              href="/credits"
              onClick={(e) => {
                e.preventDefault();
                navigate("/credits");
              }}
              className="footer-link"
            >
              Credits
            </a>
          </div>
        </footer>
      </div>
    </>
  );
}
