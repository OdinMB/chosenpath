import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { PrimaryButton, Icons } from "components/ui";
import { StoryTemplate } from "core/types";
import { TemplateCarousel } from "./components/TemplateCarousel.js";
import { OrDivider, LibraryCategoryGrid } from "./components";
import { useNewsletter } from "shared/hooks/useNewsletter";
import {
  NewsletterButton,
  NewsletterModal,
  StoryCard,
} from "shared/components";
import { StoryMetadata, UserStoryCodeAssociation } from "core/types/api";
import { useAuth } from "shared/useAuth";
import { useStoredCodeSets } from "./hooks/useStoredCodeSets";
import { StoredCodeSet } from "shared/SessionContext";
import { deleteStoredCodeSet } from "shared/utils/codeSetUtils";
import { formatTimestampToMonthDayTime } from "core/utils/dateUtils";

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
  const { codeSets, refreshLocalCodeSets } = useStoredCodeSets();

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

  // Handler for deleting a code set via StoryCard
  const handleDeleteStoryCardCodeSet = (storyId: string) => {
    const timestampToDelete = parseInt(storyId, 10);
    if (!isNaN(timestampToDelete)) {
      if (deleteStoredCodeSet(timestampToDelete)) {
        // You could add logging or user feedback here if desired
        console.log(`Code set with timestamp ${timestampToDelete} deleted.`);
      } else {
        console.warn(
          `Failed to delete code set with timestamp ${timestampToDelete}.`
        );
      }
      refreshLocalCodeSets(); // Refresh the UI
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
          {/* Stored Code Sets */}
          {codeSets.length > 0 && (
            <div className="space-y-4">
              {codeSets.map((codeSet: StoredCodeSet) => {
                const storyMetadata: StoryMetadata = {
                  id: codeSet.timestamp.toString(),
                  title:
                    codeSet.title ||
                    `Story from ${formatTimestampToMonthDayTime(
                      codeSet.timestamp
                    )}`,
                  creatorId: user?.id || "",
                  createdAt: codeSet.timestamp,
                  updatedAt: codeSet.timestamp,
                  maxTurns: 0,
                  generateImages: false,
                  templateId: undefined,
                };

                const playerAssociations: UserStoryCodeAssociation[] =
                  Object.entries(codeSet.codes).map(
                    ([playerSlot, codeValue], index) => {
                      const isCurrentUserSlot = index === 0;
                      return {
                        storyId: storyMetadata.id,
                        userId:
                          isCurrentUserSlot && user
                            ? user.id
                            : `anonymous-${playerSlot}-${codeSet.timestamp}`,
                        code: codeValue,
                        playerSlot: playerSlot,
                        lastPlayedAt:
                          codeSet.lastActive && isCurrentUserSlot
                            ? codeSet.timestamp
                            : null,
                        createdAt: codeSet.timestamp,
                      };
                    }
                  );

                const handleStoryCardPlay = (
                  storyId: string,
                  playCode?: string
                ) => {
                  if (playCode) {
                    handleCodeSubmit(playCode);
                  } else {
                    const targetCodeSet = codeSets.find(
                      (cs) => cs.timestamp.toString() === storyId
                    );
                    if (targetCodeSet) {
                      const firstCode = Object.values(targetCodeSet.codes)[0];
                      if (firstCode) {
                        handleCodeSubmit(firstCode);
                      }
                    }
                  }
                };

                return (
                  <StoryCard
                    key={storyMetadata.id}
                    story={storyMetadata}
                    players={playerAssociations}
                    onPlay={handleStoryCardPlay}
                    onDelete={handleDeleteStoryCardCodeSet}
                    size="default"
                  />
                );
              })}
            </div>
          )}

          {codeSets.length > 0 && <OrDivider />}

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
