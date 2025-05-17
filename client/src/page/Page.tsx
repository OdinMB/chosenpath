import { useState } from "react";
import { useNavigate /*, useLoaderData */ } from "react-router-dom";
import { PrimaryButton, Icons } from "components/ui";
import { StoryTemplate } from "core/types";
import { TemplateCarousel } from "./components/TemplateCarousel.js";
import { OrDivider, LibraryCategoryGrid } from "./components";
import { useNewsletter } from "shared/hooks/useNewsletter";
import { NewsletterButton, NewsletterModal } from "shared/components";
import { useAuth } from "shared/useAuth";
import { UserStoriesList } from "../users/components/UserStoriesList";
import { StoredCodeSetsList } from "./components/StoredCodeSetsList";

// LibraryLoaderData interface removed as useLoaderData is not called directly in Page for its return value

// Page component refactored to use React Router
export function Page() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const {
    isNewsletterModalOpen,
    openNewsletterModal,
    closeNewsletterModal,
    handleSubscribe,
  } = useNewsletter();
  const { user } = useAuth();
  // useLoaderData() is not called here as its return (templates) isn't directly used by Page.tsx logic.
  // The libraryLoader for the route will still run.

  // Handle code submission - now uses gameService directly
  const handleCodeSubmit = (code: string) => {
    // Store the code in localStorage with a unique key for this session
    const tabId =
      sessionStorage.getItem("tabId") ||
      Math.random().toString(36).substring(2, 15);
    localStorage.setItem(`playerCode_${tabId}`, code);

    // Navigate to the game page with the code
    navigate(`/game/${code}`);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    handleCodeSubmit(code.trim());
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCode(e.target.value.toUpperCase());
  };

  // Navigate to setup page for new story
  const handleNewStory = () => {
    navigate("/setup");
  };

  // Navigate to template configuration
  const handleSelectTemplate = (template: StoryTemplate) => {
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
            Everything is free during the alpha phase. No account required. Jump
            in and share your feedback!
          </p>
        </div>

        <div className="space-y-6">
          {user ? (
            // Authenticated user view: UserStoriesList will fetch its own data.
            <UserStoriesList onCodeSelect={handleCodeSubmit} />
          ) : (
            // Unauthenticated user view
            <StoredCodeSetsList onCodeSubmit={handleCodeSubmit} />
          )}

          {/* Divider logic might need adjustment based on UserStoriesList content / StoredCodeSetsList visibility */}
          {/* For simplicity, let's assume a divider is usually good before Create Your Own Story */}
          <OrDivider />

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
          <div className="mb-4 flex items-center">
            <NewsletterButton onClick={openNewsletterModal} />
          </div>

          <p className="mb-2">
            Looking for collaborators. Are you a writer, storyteller, designer,
            or world builder? Reach out!
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
    </>
  );
}
