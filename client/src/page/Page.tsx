import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { PrimaryButton } from "components/ui";
import { TemplateMetadata } from "core/types";
import { TemplateCarousel } from "./components/TemplateCarousel.js";
import { OrDivider, Footer, CategoryTile } from "./components";
import { ResumableStories } from "resources/stories/ResumableStories.js";
import { useAuth } from "client/shared/auth/useAuth.js";
import { config } from "../config";

// Page component refactored to use React Router
export function Page() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [showResumableSection, setShowResumableSection] = useState(true);
  const [isValidating, setIsValidating] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const { user } = useAuth();
  const previousUserIdRef = useRef<string | undefined | null>(user?.id);

  useEffect(() => {
    const currentUserId = user?.id;
    if (previousUserIdRef.current !== currentUserId) {
      setShowResumableSection(true);
    }
    previousUserIdRef.current = currentUserId;
  }, [user?.id]);

  const validateCodeFormat = (inputCode: string): boolean => {
    const trimmedCode = inputCode.trim();
    // Story codes are exactly 6 alphanumeric characters (0-9, A-Z)
    // NOTE: This validation must match code generation in server/src/stories/StoryCreationService.ts (generatePlayerCodes method)
    return trimmedCode.length === 6 && /^[A-Z0-9]+$/.test(trimmedCode);
  };

  const handleJoinGame = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedCode = code.trim();
    
    if (!trimmedCode) return;
    
    if (!validateCodeFormat(trimmedCode)) {
      setValidationError("Code must be exactly 6 characters and contain only letters and numbers");
      return;
    }

    setIsValidating(true);
    setValidationError(null);

    try {
      const response = await fetch(`/api/stories/${trimmedCode}/exists`);
      
      if (!response.ok) {
        if (response.status === 404) {
          setValidationError("Story code not found. Please check the code and try again.");
          return;
        }
        throw new Error("Failed to validate story code");
      }

      navigate(`/game/${trimmedCode}`);
    } catch {
      setValidationError("Unable to validate code. Please try again.");
    } finally {
      setIsValidating(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value.toUpperCase();
    setCode(newValue);
    
    if (validationError) {
      setValidationError(null);
    }
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
              className="text-link focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent rounded"
            >
              Story Engine
            </a>
            . Define characters, conflicts, mechanics, possible endings, and
            much more. Chosen Path generates prose and images, applies
            mechanics, and coordinates multiplayer.
            {/* <a
              href="/users/signin"
              onClick={(e) => {
                e.preventDefault();
                navigate("/users/signin");
              }}
              className="text-link focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent rounded"
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
              className="text-link focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent rounded"
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
              className="text-link focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent rounded"
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
            <div className="space-y-2">
              <div className="flex flex-row gap-3 w-full">
                <div className="flex-grow min-w-0 relative">
                  <input
                    id="code"
                    type="text"
                    value={code}
                    onChange={handleInputChange}
                    className={`w-full h-10 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent focus:border-accent bg-white text-primary shadow-sm placeholder-primary-400 ${
                      validationError 
                        ? "border-red-300" 
                        : code.trim() && validateCodeFormat(code.trim())
                        ? "border-green-300"
                        : "border-primary-100"
                    }`}
                    placeholder="Story code"
                    disabled={isValidating}
                  />
                  {code.trim() && validateCodeFormat(code.trim()) && !validationError && (
                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                      <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                  )}
                </div>
                <PrimaryButton
                  type="submit"
                  disabled={!code.trim() || !validateCodeFormat(code.trim()) || isValidating}
                  className="whitespace-nowrap min-w-[90px] relative"
                >
                  {isValidating ? (
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Joining...</span>
                    </div>
                  ) : (
                    "Join Game"
                  )}
                </PrimaryButton>
              </div>
              {validationError && (
                <p className="text-red-600 text-sm px-1">
                  {validationError}
                </p>
              )}
            </div>
          </form>
        </div>

        <Footer />
      </div>
    </>
  );
}
