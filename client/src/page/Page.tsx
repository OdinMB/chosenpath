import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { PrimaryButton, Icons } from "components/ui";
import { StoryTemplate } from "core/types";
import { TemplateCarousel } from "./components/TemplateCarousel.js";
import {
  StoredCodeSetsList,
  OrDivider,
  LibraryCategoryGrid,
} from "./components";
import { hasCodeSets } from "shared/utils/codeSetUtils.js";
import { useNewsletter } from "shared/hooks/useNewsletter";
import { NewsletterButton, NewsletterModal } from "shared/components";
import { gameService } from "game/GameService";
import { useSession } from "shared/useSession";
import { Header } from "shared/components";

// Page component refactored to use React Router
export function Page() {
  const navigate = useNavigate();
  const { setIsLoading } = useSession();
  const [code, setCode] = useState("");
  const {
    isNewsletterModalOpen,
    openNewsletterModal,
    closeNewsletterModal,
    handleSubscribe,
  } = useNewsletter();
  const hasStoredCodeSets = hasCodeSets();

  // Handle code submission - now uses gameService directly
  const handleCodeSubmit = (code: string) => {
    setIsLoading(true);
    gameService.verifyCode(code);

    // Store the code in localStorage with a unique key for this session
    const tabId =
      sessionStorage.getItem("tabId") ||
      Math.random().toString(36).substring(2, 15);
    localStorage.setItem(`playerCode_${tabId}`, code);

    // Navigation will be handled by the session effect when the story is loaded
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
      navigate(`/templates?tags=${categoryTag}`);
    } else {
      navigate("/templates");
    }
  };

  return (
    <>
      <Header size="large" />
      <div className="max-w-md mx-auto p-4 font-lora">
        <div className="mb-8 text-primary-800">
          <p className="mb-2">
            Dive into immersive stories. Play alone or invite friends to shape
            the story with multiple characters — whether you're exploring
            distant galaxies or serving croissants in a Parisian café.
          </p>
          <p>
            Everything is free during the alpha phase. Jump in and share your
            feedback!
          </p>
        </div>

        <div className="space-y-6">
          {/* Stored Code Sets */}
          <StoredCodeSetsList onCodeSubmit={handleCodeSubmit} />

          {hasStoredCodeSets && <OrDivider />}

          <PrimaryButton
            onClick={handleNewStory}
            fullWidth
            size="lg"
            className="font-semibold"
          >
            Create Your Own Story
          </PrimaryButton>

          <OrDivider />

          {/* Browse Library with Categories */}
          <LibraryCategoryGrid onBrowseLibrary={handleBrowseWithCategory} />

          <OrDivider />

          {/* Join with Code */}
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

          {/* Choose from Carousel */}
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
