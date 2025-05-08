import { useSession } from "shared/useSession";
import { StatDisplay } from "./StatDisplay";
import { StoryDisplay } from "./StoryDisplay";
import { CharacterSelection } from "./CharacterSelection";
import { SidebarFeedbackButton } from "./feedback/SidebarFeedbackButton";
import { FeedbackModal } from "./feedback/FeedbackModal";
import { ClientStat, StatValue, StatValueEntry } from "core/types";
import { useState } from "react";
import { PendingPlayers } from "./PendingPlayers.js";
import { PrimaryButton, Icons } from "components/ui";
import { StoryImage } from "shared/components/StoryImage";
import { createPlayerIdentityImage } from "shared/utils/imageUtils";
import { ClientStateManager } from "core/models/ClientStateManager";
import { PlayerInterlude } from "./PlayerInterlude";
import { LoadingSpinner } from "components/ui";

interface Props {
  onExitGame: () => void;
  onChoiceSelected: (optionIndex: number) => void;
  onCharacterSelected?: (
    identityIndex: number,
    backgroundIndex: number
  ) => void;
}

function StatGroup({
  title,
  stats,
  getStatValue,
}: {
  title: string;
  stats: ClientStat[];
  getStatValue: (statId: string) => StatValue;
}) {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className="bg-white rounded-lg pt-2 pb-1 pl-3 pr-3 border border-primary-100 shadow-md">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-center gap-2 hover:text-primary"
      >
        <h4 className="text-primary-700 text-center font-bold">{title}</h4>
        <Icons.ChevronDown
          className={`w-4 h-4 transition-transform ${
            isExpanded ? "rotate-180" : ""
          }`}
        />
      </button>
      {isExpanded && (
        <div className="mt-2 grid gap-0">
          {stats.map((stat) => (
            <StatDisplay
              key={stat.id}
              name={stat.name}
              value={getStatValue(stat.id)}
              type={stat.type}
              tooltip={stat.tooltip}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function StatSection({
  title,
  stats,
  getStatValue,
}: {
  title?: string;
  stats: ClientStat[];
  getStatValue: (statId: string) => StatValue;
}) {
  const visibleStats = stats.filter((stat) => stat.isVisible !== false);
  const groupedStats = visibleStats.reduce<Record<string, ClientStat[]>>(
    (acc, stat) => {
      const group = stat.group || "Other";
      acc[group] = [...(acc[group] || []), stat];
      return acc;
    },
    {}
  );

  if (visibleStats.length === 0) {
    return (
      <div className="text-primary-500 italic">
        No {title?.toLowerCase() ?? "character"} stats available
      </div>
    );
  }

  const groups = Object.keys(groupedStats);

  return (
    <div className="space-y-3">
      {title && (
        <h3 className="text-primary-700 mb-2 text-center font-bold">{title}</h3>
      )}
      {groups.map((group) => (
        <StatGroup
          key={group}
          title={group}
          stats={groupedStats[group]}
          getStatValue={getStatValue}
        />
      ))}
    </div>
  );
}

export function GameLayout({
  onExitGame,
  onChoiceSelected,
  onCharacterSelected,
}: Props) {
  const { storyState } = useSession();
  const [showStats, setShowStats] = useState(false);
  const [showFluff, setShowFluff] = useState(false);
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
  const stateManager = new ClientStateManager();

  if (!storyState) return null;

  // Get the current player's slot
  const playerSlot = Object.keys(storyState.players)[0];
  const currentPlayer = storyState.players[playerSlot];

  // Check if the story has images
  const storyIncludesImages = stateManager.includesImages(storyState);

  // Character selection mode is active if:
  // 1. Character selection is not completed globally AND
  // 2. The current player hasn't selected a character yet
  const isCharacterSelectionMode =
    !storyState.characterSelectionCompleted &&
    (currentPlayer.identityChoice === -1 ||
      currentPlayer.backgroundChoice === -1);

  const handleMainContentClick = () => {
    // Only collapse sidebar on small screens
    if (window.innerWidth < 768 && showStats) {
      setShowStats(false);
    }
  };

  const renderSidebar = () => {
    // Common sidebar props
    const sidebarClassName = `
      w-80 bg-white shadow-sm 
      fixed md:sticky top-0 h-screen 
      z-20 md:z-0 
      transform transition-transform duration-200 ease-in-out 
      ${showStats ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
      overflow-y-auto md:overflow-visible 
      p-4 flex flex-col
    `;

    // Common footer with title and exit button
    const renderFooter = () => (
      <div className="mt-4">
        <SidebarFeedbackButton
          closeSidebarOnMobile={() => setShowStats(false)}
          onOpenFeedbackModal={() => setIsFeedbackModalOpen(true)}
        />

        <PrimaryButton
          onClick={onExitGame}
          className="w-full"
          rightIcon={<Icons.LogOut />}
        >
          <span className="font-semibold text-sm mr-4">Leave Story</span>
        </PrimaryButton>
      </div>
    );

    if (isCharacterSelectionMode) {
      return (
        <aside className={sidebarClassName}>
          <div className="flex-grow"></div>

          {stateManager.getNumberOfPlayers(storyState) > 1 && (
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-primary mb-2 text-center">
                Players Status
              </h3>
              <div>
                <PendingPlayers
                  pendingPlayers={storyState.pendingPlayers}
                  numberOfPlayers={stateManager.getNumberOfPlayers(storyState)}
                  currentPlayer={playerSlot}
                />
              </div>
            </div>
          )}

          {renderFooter()}
        </aside>
      );
    }

    // Regular sidebar for game mode
    const player = storyState.players[playerSlot];

    // Function to get stat value from player or shared stats
    const getStatValue = (statId: string): StatValue => {
      // Check player stats first
      const playerStatValue = player.statValues.find(
        (entry: StatValueEntry) => entry.statId === statId
      );
      if (playerStatValue) return playerStatValue.value;

      // For shared stats, we need to look them up from the player's statValues
      // or from a separate array if it exists
      // First try to find in player's statValues (some implementations might include shared stats here)
      const sharedStatValue = storyState.sharedStatValues.find(
        (entry: StatValueEntry) => entry.statId === statId
      );
      if (sharedStatValue) return sharedStatValue.value;

      // If we can't find it, return a default value based on the stat type
      // Find the stat definition to determine its type
      const statDef = [
        ...storyState.playerStats,
        ...storyState.sharedStats,
      ].find((stat) => stat.id === statId);

      if (statDef) {
        console.error(
          `ERROR: Stat value not found for stat: ${statId} (${statDef.name})`
        );

        switch (statDef.type) {
          case "number":
            return 0;
          case "percentage":
          case "opposites":
            return 50;
          case "string[]":
            return [];
          default:
            return "";
        }
      }

      // Default fallback
      console.error(`ERROR: Stat definition not found for stat: ${statId}`);
      return "";
    };

    // Create player identity image if needed
    let playerIdentityImage = undefined;
    if (storyIncludesImages && player.identityChoice >= 0) {
      playerIdentityImage = createPlayerIdentityImage(
        playerSlot,
        player.identityChoice,
        storyState.templateId ? "template" : "story",
        storyState.templateId ? storyState.templateId : storyState.id
      );
    }

    return (
      <aside className={sidebarClassName}>
        <section className="mb-3 pb-2">
          <div className="flex items-center justify-start">
            {playerIdentityImage && (
              <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 mr-3">
                <StoryImage
                  image={playerIdentityImage}
                  alt={`${player.name}`}
                  className="w-full h-full"
                  responsivePosition={true}
                  desktopOffset="4%"
                  mobileOffset="4%"
                />
              </div>
            )}
            <div className="flex-grow text-center">
              <h2 className="text-xl font-semibold text-primary mb-1 flex items-center justify-center gap-2">
                {player.name}
                <button
                  onClick={() => setShowFluff(!showFluff)}
                  className="text-primary-500 hover:text-primary-700"
                  aria-label={
                    showFluff
                      ? "Hide character description"
                      : "Show character description"
                  }
                >
                  <Icons.ChevronDown
                    className={`w-4 h-4 transform transition-transform ${
                      showFluff ? "rotate-180" : ""
                    }`}
                  />
                </button>
              </h2>
              <p className="text-primary-600">
                {player.pronouns.personal}/{player.pronouns.object}
              </p>
            </div>
          </div>

          {showFluff && (
            <div className="bg-white rounded-lg p-3 mt-4 border border-primary-100 shadow-md">
              <p className="text-primary-600 text-sm">
                {player.appearance} {player.fluff}
              </p>
            </div>
          )}
        </section>

        <section className="space-y-4 flex-grow">
          <StatSection
            stats={[...storyState.playerStats, ...storyState.sharedStats]}
            getStatValue={getStatValue}
          />
        </section>

        <div className="mt-8 w-full">
          <PendingPlayers
            pendingPlayers={storyState.pendingPlayers}
            numberOfPlayers={stateManager.getNumberOfPlayers(storyState)}
            currentPlayer={playerSlot}
          />
        </div>

        {renderFooter()}
      </aside>
    );
  };

  // Mobile stats toggle button (shown in both game mode and character selection)
  const renderMobileToggle = () => {
    return (
      <button
        onClick={() => setShowStats(!showStats)}
        className="fixed top-4 right-4 md:hidden z-30 bg-white p-2 rounded-lg shadow-sm"
        aria-label="Toggle Stats Panel"
      >
        {showStats ? <Icons.Close /> : <Icons.Menu />}
      </button>
    );
  };

  return (
    <div className="min-h-screen font-lora">
      {renderMobileToggle()}

      <div className="md:flex">
        {renderSidebar()}

        {/* Main Content Area */}
        <main className="flex-1" onClick={handleMainContentClick}>
          {isCharacterSelectionMode && onCharacterSelected ? (
            <CharacterSelection onCharacterSelected={onCharacterSelected} />
          ) : !storyState.characterSelectionCompleted ? (
            // Show loading spinner when character selection is not completed globally
            // but the current player has already selected their character
            <div className="flex flex-col items-center justify-center h-full min-h-[70vh]">
              <PlayerInterlude
                storyState={storyState}
                className="mt-8 mb-4 sm:mb-8"
              />
              <LoadingSpinner
                size="medium"
                message="First story beat is being generated..."
                messageSize="large"
              />

              {stateManager.getNumberOfPlayers(storyState) > 1 && (
                <div className="mt-8 w-full max-w-md flex justify-center">
                  <PendingPlayers
                    pendingPlayers={storyState.pendingPlayers}
                    numberOfPlayers={stateManager.getNumberOfPlayers(
                      storyState
                    )}
                    currentPlayer={playerSlot}
                  />
                </div>
              )}
            </div>
          ) : (
            <StoryDisplay onChoiceSelected={onChoiceSelected} />
          )}
        </main>
      </div>

      {/* Feedback Modal at root level */}
      <FeedbackModal
        isOpen={isFeedbackModalOpen}
        onClose={() => setIsFeedbackModalOpen(false)}
        mode="general"
      />
    </div>
  );
}
