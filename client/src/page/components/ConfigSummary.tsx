import { ColoredBox } from "components/ui";
import { GameMode } from "core/types";
import { PromptCategory } from "../data/suggestionData";

interface ConfigSummaryProps {
  selectedCategory: PromptCategory;
  categoryConfigs: Record<PromptCategory, { label: string }>;
  playerCount: number;
  gameMode?: GameMode;
  generateImages?: boolean;
  pregenerateBeats?: boolean;
  templateMode?: boolean;
  showPlayerInfo?: boolean;
}

export const ConfigSummary = ({
  selectedCategory,
  categoryConfigs,
  playerCount,
  gameMode,
  generateImages,
  pregenerateBeats,
  templateMode = false,
  showPlayerInfo = false,
}: ConfigSummaryProps) => {
  const categoryImages: Record<PromptCategory, string> = {
    "enjoy-fiction": "/category-fiction.jpeg",
    "vent-about-reality": "/category-vent.jpeg",
    "pretend-to-be": "/category-pretendtobe.jpeg",
    "read-with-kids": "/category-kids.jpeg",
    "see-your-future-self": "/category-futureself.jpeg",
    "learn-something": "/category-learn.jpeg",
    "flexible": "/placeholder-image.png",
  };

  return (
    <div className="w-full sm:max-w-lg sm:mx-auto">
      <ColoredBox colorType="tertiary" isActive={true} className="p-4">
      <div className="flex gap-4 items-center">
        {/* Category image */}
        <div className="relative overflow-hidden h-16 w-20 rounded-lg flex-shrink-0">
          <img
            src={categoryImages[selectedCategory]}
            alt={categoryConfigs[selectedCategory].label}
            className="w-full h-full object-cover transition-transform duration-300 hover:scale-110 rounded-lg"
          />
        </div>
        {/* Configurations */}
        <div className="flex-1 space-y-1">
          <div className="text-base">
            <span className="text-primary-600">{templateMode ? "I want players to" : "I want to"}</span>{" "}
            <span className="font-medium text-primary">
              {selectedCategory === "see-your-future-self" && templateMode 
                ? "meet their future self" 
                : categoryConfigs[selectedCategory].label}
            </span>
          </div>
          {showPlayerInfo && (
            <div className="flex flex-wrap gap-4 gap-y-1 text-xs text-primary-600">
              <div>
                <span>Players:</span>{" "}
                <span className="font-medium text-primary">{playerCount}</span>
              </div>
              {playerCount > 1 && gameMode && (
                <div>
                  <span>Mode:</span>{" "}
                  <span className="font-medium text-primary">
                    {gameMode.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                  </span>
                </div>
              )}
              {!templateMode && generateImages !== undefined && (
                <div>
                  <span>Images:</span>{" "}
                  <span className="font-medium text-primary">
                    {generateImages ? "Yes" : "No"}
                  </span>
                </div>
              )}
              {!templateMode && pregenerateBeats !== undefined && (
                <div>
                  <span>Pregeneration:</span>{" "}
                  <span className="font-medium text-primary">
                    {pregenerateBeats ? "Yes" : "No"}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      </ColoredBox>
    </div>
  );
};