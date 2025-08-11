import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { PrimaryButton } from "components/ui";
import { TemplateMetadata } from "core/types";
import { TemplateCarousel } from "./components/TemplateCarousel.js";
import { OrDivider, Footer, CategoryTile } from "./components";
import { ResumableStories } from "resources/stories/ResumableStories.js";
import { config } from "../config";

// Page component refactored to use React Router
export function Page() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [showResumableSection, setShowResumableSection] = useState(true);

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

  const handleBrowseLibrary = () => {
    navigate("/library");
  };

  const categoryTiles = [
    {
      id: "enjoy-fiction",
      title: "Enjoy Fiction",
      image: "/category-fiction.jpeg",
      url: "/setup?step=3&category=enjoy-fiction&players=1&images=true&pregenerate=true",
    },
    {
      id: "vent-about-reality",
      title: "Vent about Reality",
      image: "/category-vent.jpeg",
      url: "/setup?step=3&category=vent-about-reality&players=1&images=true&pregenerate=true",
    },
    {
      id: "pretend-to-be",
      title: "Pretend to be",
      image: "/category-pretendtobe.jpeg",
      url: "/setup?step=3&category=pretend-to-be&players=1&images=true&pregenerate=true",
    },
    {
      id: "read-with-kids",
      title: "Read with Kids",
      image: "/category-kids.jpeg",
      url: "/setup?step=3&category=read-with-kids&players=1&images=true&pregenerate=true",
    },
    {
      id: "see-your-future-self",
      title: "Meet your Future Self",
      mobileTitle: "Meet Future Self",
      image: "/category-futureself.jpeg",
      url: "/setup?step=3&category=see-your-future-self&players=1&images=true&pregenerate=true",
    },
    {
      id: "learn-something",
      title: "Learn Something",
      image: "/category-learn.jpeg",
      url: "/setup?step=3&category=learn-something&players=1&images=true&pregenerate=true",
    },
  ];

  return (
    <>
      <div className="max-w-md mx-auto p-4 font-lora">
        <div className="mb-8 text-primary-800">
          <p className="mb-2">
            Dive into interactive stories. Play alone or invite friends to shape
            a story with multiple characters — whether you're exploring distant
            galaxies or serving croissants in a Parisian café.
          </p>
          <p className="mb-2">
            For creators, Chosen Path is a{" "}
            <a
              href="/academy"
              onClick={(e) => {
                e.preventDefault();
                navigate("/academy/story-engine-not-writing-tool");
              }}
              className="text-link"
            >
              Story Engine
            </a>
            . Define Worlds with setting, characters, conflicts, mechanics,
            possible endings, and much more. Chosen Path generates prose and
            images, reacts to player choices, applies mechanics, and coordinates
            multiplayer.
            {/* <a
              href="/users/signin"
              onClick={(e) => {
                e.preventDefault();
                navigate("/users/signin");
              }}
              className="text-link"
            >
              Sign in
            </a>{" "} */}{" "}
            Visit{" "}
            <a
              href="/academy"
              onClick={(e) => {
                e.preventDefault();
                navigate("/academy");
              }}
              className="text-link"
            >
              Worldbuilding Academy
            </a>{" "}
            to learn more.
          </p>
          <p>
            Everything is free during the beta phase. Jump in, share your
            feedback, and say hello on{" "}
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
                onSetHasContent={setShowResumableSection}
                forceSingleColumn={true}
              />
              <OrDivider />
            </>
          )}

          {/* Carousel + Browse Entire Library */}
          <TemplateCarousel onPlay={handleSelectTemplate} />

          <PrimaryButton onClick={handleBrowseLibrary} fullWidth size="lg">
            Browse Entire Library
          </PrimaryButton>

          <OrDivider />

          {/* Create Your Own Story + 6 tiles */}
          <PrimaryButton
            onClick={handleNewStory}
            fullWidth
            size="lg"
            className="font-semibold"
          >
            Create Your Own Story
          </PrimaryButton>

          <div className="rounded-lg overflow-hidden border border-primary-100">
            <div className="grid grid-cols-2">
              {categoryTiles.map((tile, index) => (
                <div
                  key={tile.id}
                  className={`
                    ${index % 2 !== 0 ? "border-l border-primary-100" : ""}
                    ${
                      Math.floor(index / 2) <
                      Math.floor((categoryTiles.length - 1) / 2)
                        ? "border-b border-primary-100"
                        : ""
                    }
                  `}
                  onClick={() => navigate(tile.url)}
                >
                  <CategoryTile
                    image={tile.image}
                    title={tile.title}
                    mobileTitle={tile.mobileTitle}
                    onClick={() => navigate(tile.url)}
                  />
                </div>
              ))}
            </div>
          </div>

          <OrDivider />

          {/* Join game */}
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
        </div>

        <Footer />
      </div>
    </>
  );
}
