import { useSession } from "../hooks/useSession";
import { StatDisplay } from "./StatDisplay";
import { StoryDisplay } from "./StoryDisplay";
import { ClientStat } from "../../../shared/types/stat";
import { useState } from "react";
import { PendingPlayers } from "./PendingPlayers";

interface Props {
  onExitGame: () => void;
  onChoiceSelected: (optionIndex: number) => void;
}

function StatGroup({ title, stats }: { title: string; stats: ClientStat[] }) {
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
              value={stat.value}
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
}: {
  title?: string;
  stats: ClientStat[];
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
        <StatGroup key={group} title={group} stats={groupedStats[group]} />
      ))}
    </div>
  );
}

export function GameLayout({ onExitGame, onChoiceSelected }: Props) {
  const { storyState } = useSession();
  const [showStats, setShowStats] = useState(false);
  const [showFluff, setShowFluff] = useState(false);

  if (!storyState) return null;

  const playerSlot = Object.keys(storyState.players)[0];
  const player = storyState.players[playerSlot];

  const allStats: ClientStat[] = [...player.stats, ...storyState.sharedStats];

  return (
    <div className="min-h-screen font-lora">
      {/* Mobile Stats Toggle */}
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

      <div className="md:flex">
        {/* Sidebar */}
        <aside
          className={`
            w-80 bg-white shadow-sm
            fixed md:sticky top-0 h-screen
            z-20 md:z-0
            transform transition-transform duration-200 ease-in-out
            ${
              showStats ? "translate-x-0" : "-translate-x-full md:translate-x-0"
            }
            overflow-y-auto md:overflow-visible
            p-4
            flex flex-col
          `}
        >
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
            <p className="text-gray-600 text-center">{player.pronouns}</p>
            {showFluff && (
              <div className="bg-gray-50 rounded-lg p-3 mt-4 border border-gray-100">
                <p className="text-gray-600 text-sm">{player.fluff}</p>
              </div>
            )}
          </section>

          <section className="space-y-4 flex-grow">
            <StatSection stats={allStats} />
          </section>

          <div className="mt-8">
            <PendingPlayers
              pendingPlayers={storyState.pendingPlayers}
              numberOfPlayers={storyState.numberOfPlayers}
              currentPlayer={playerSlot}
            />
          </div>

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
        </aside>

        {/* Main Content Area */}
        <main className="flex-1">
          <StoryDisplay onChoiceSelected={onChoiceSelected} />
        </main>
      </div>
    </div>
  );
}
