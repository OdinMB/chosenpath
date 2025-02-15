import { useSession } from "../hooks/useSession";
import { StatDisplay } from "./StatDisplay";
import { StoryDisplay } from "./StoryDisplay";
import { z } from "zod";
import { statSchema } from "../../../shared/types/stat";
import { useState } from "react";
import { PendingPlayers } from "./PendingPlayers";

type Stat = z.infer<typeof statSchema>;

interface Props {
  onExitGame: () => void;
  onChoiceSelected: (optionIndex: number) => void;
}

function StatSection({ title, stats }: { title?: string; stats: Stat[] }) {
  const visibleStats = stats.filter((stat) => stat.isVisible !== false);

  return (
    <div>
      {title && <h3 className="text-gray-700 mb-2 text-center">{title}</h3>}
      <div className="space-y-3">
        {visibleStats.map((stat) => (
          <StatDisplay
            key={stat.id}
            name={stat.name}
            value={stat.value}
            type={stat.type}
          />
        ))}
        {visibleStats.length === 0 && (
          <div className="text-gray-500 italic">
            No {title?.toLowerCase() ?? "character"} stats available
          </div>
        )}
      </div>
    </div>
  );
}

export function GameLayout({ onExitGame, onChoiceSelected }: Props) {
  const { storyState } = useSession();
  const [showStats, setShowStats] = useState(false);

  if (!storyState) return null;

  const playerSlot = Object.keys(storyState.players)[0];
  const player = storyState.players[playerSlot];
  const hasWorldStats = Object.keys(storyState.worldStats).length > 0;

  return (
    <div className="min-h-screen">
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
            <h2 className="text-xl font-semibold text-gray-900 mb-1 text-center">
              {player.character.name}
            </h2>
            <p className="text-gray-600 text-center">
              {player.character.pronouns}
            </p>
          </section>

          <section className="space-y-8 flex-grow">
            <StatSection stats={player.characterStats} />
            {hasWorldStats && (
              <StatSection title="World" stats={storyState.worldStats} />
            )}
          </section>

          <div className="mt-8">
            <PendingPlayers
              pendingPlayers={storyState.pendingPlayers}
              currentPlayer={playerSlot}
            />
          </div>

          <button
            onClick={onExitGame}
            className="mt-4 text-sm font-medium transition-colors duration-200
              md:text-gray-600 md:hover:text-red-600 md:bg-transparent md:p-2
              w-full py-2 px-4 rounded-lg bg-red-600 text-white hover:bg-red-700 md:hover:bg-transparent"
          >
            Exit story
          </button>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1">
          <StoryDisplay onChoiceSelected={onChoiceSelected} />
        </main>
      </div>
    </div>
  );
}
