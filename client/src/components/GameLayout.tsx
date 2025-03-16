import { useSession } from "../hooks/useSession";
import { StatDisplay } from "./StatDisplay";
import { StoryDisplay } from "./StoryDisplay";
import { CharacterSelection } from "./CharacterSelection";
import {
  ClientStat,
  StatValue,
  StatValueEntry,
} from "../../../shared/types/stat";
import { useState } from "react";
import { PendingPlayers } from "./PendingPlayers";
import { LoadingSpinner } from "./LoadingSpinner";

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
    <div className="bg-gray-50 rounded-lg pt-2 pb-1 pl-3 pr-3 border border-gray-100">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-center gap-2 hover:text-gray-900"
      >
        <h4 className="text-gray-700 text-center font-bold">{title}</h4>
        <svg
          className={`w-4 h-4 transition-transform ${
            isExpanded ? "rotate-180" : ""
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>
      {isExpanded && (
        <div className="mt-2 grid gap-0">
          {stats.map((stat) => (
            <StatDisplay
              key={stat.id}
              name={stat.name}
              value={getStatValue(stat.id)}
              type={stat.type}
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
      <div className="text-gray-500 italic">
        No {title?.toLowerCase() ?? "character"} stats available
      </div>
    );
  }

  const groups = Object.keys(groupedStats);

  return (
    <div className="space-y-3">
      {title && (
        <h3 className="text-gray-700 mb-2 text-center font-bold">{title}</h3>
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

  if (!storyState) return null;

  // Get the current player's slot
  const playerSlot = Object.keys(storyState.players)[0];
  const currentPlayer = storyState.players[playerSlot];

  // Character selection mode is active if:
  // 1. Character selection is not completed globally AND
  // 2. The current player hasn't selected a character yet
  const isCharacterSelectionMode =
    !storyState.characterSelectionCompleted && !currentPlayer.characterSelected;

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
      <div className="mt-4 text-center">
        <h3 className="text-lg font-semibold text-gray-800 mb-2">
          {storyState.title}
        </h3>
        <button
          onClick={onExitGame}
          className="text-sm font-medium transition-colors duration-200
            md:text-gray-600 md:hover:text-red-600 md:bg-transparent md:p-2
            w-full py-2 px-4 rounded-lg bg-red-600 text-white hover:bg-red-700 md:hover:bg-transparent"
        >
          Exit story
        </button>
      </div>
    );

    if (isCharacterSelectionMode) {
      return (
        <aside className={sidebarClassName}>
          <div className="flex-grow"></div>

          {storyState.numberOfPlayers > 1 && (
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-gray-800 mb-2 text-center">
                Players Status
              </h3>
              <PendingPlayers
                pendingPlayers={storyState.pendingPlayers}
                numberOfPlayers={storyState.numberOfPlayers}
                currentPlayer={playerSlot}
              />
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

    return (
      <aside className={sidebarClassName}>
        <section className="mb-6 pb-4">
          <div className="flex items-center justify-center gap-2">
            <h2 className="text-xl font-semibold text-gray-900 mb-1">
              {player.name}
            </h2>
            <button
              onClick={() => setShowFluff(!showFluff)}
              className="text-gray-500 hover:text-gray-700"
              aria-label={
                showFluff
                  ? "Hide character description"
                  : "Show character description"
              }
            >
              <svg
                className={`w-5 h-5 transform transition-transform ${
                  showFluff ? "rotate-180" : ""
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>
          </div>
          <p className="text-gray-600 text-center">
            {player.pronouns.personal}/{player.pronouns.object}
          </p>
          {showFluff && (
            <div className="bg-gray-50 rounded-lg p-3 mt-4 border border-gray-100">
              <p className="text-gray-600 text-sm">
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

        <div className="mt-8">
          <PendingPlayers
            pendingPlayers={storyState.pendingPlayers}
            numberOfPlayers={storyState.numberOfPlayers}
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
        {showStats ? (
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        ) : (
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 6h16M4 12h16m-7 6h7"
            />
          </svg>
        )}
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
              <h1 className="text-2xl font-bold mb-6 text-indigo-800">
                Character Selected
              </h1>

              <LoadingSpinner size="large" message="" />

              {storyState.numberOfPlayers > 1 && (
                <div className="mt-8 w-full max-w-md">
                  <PendingPlayers
                    pendingPlayers={storyState.pendingPlayers}
                    numberOfPlayers={storyState.numberOfPlayers}
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
    </div>
  );
}
