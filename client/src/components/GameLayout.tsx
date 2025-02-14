import { useSession } from "../hooks/useSession";
import { StatDisplay } from "./StatDisplay";
import { StoryDisplay } from "./StoryDisplay";
import { z } from "zod";
import { statSchema } from "../../../shared/types/stat";

type Stat = z.infer<typeof statSchema>;

interface Props {
  onExitGame: () => void;
  onChoiceSelected: (optionIndex: number) => void;
}

function StatSection({ title, stats }: { title?: string; stats: Stat[] }) {
  const visibleStats = stats.filter(stat => stat.isVisible !== false);
  
  return (
    <div>
      {title && (
        <h3 className="text-gray-700 mb-2 text-center">{title}</h3>
      )}
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
          <div className="text-gray-500 italic">No {title?.toLowerCase() ?? 'character'} stats available</div>
        )}
      </div>
    </div>
  );
}

export function GameLayout({ onExitGame, onChoiceSelected }: Props) {
  const { storyState } = useSession();

  if (!storyState) {
    return null;
  }

  // Get the player data from the first (and only) player in the players object
  const playerSlot = Object.keys(storyState.players)[0];
  const player = storyState.players[playerSlot];

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="mx-auto max-w-7xl flex gap-4 h-[calc(100vh-2rem)]">
        {/* Sidebar */}
        <aside className="w-80 bg-white rounded-lg shadow-sm p-4 flex flex-col">
          {/* Character Section */}
          <section className="mb-6 pb-4">
            <h2 className="text-xl font-semibold text-gray-900 mb-1 text-center">
              {player.character.name}
            </h2>
            <p className="text-gray-600 text-center">{player.character.pronouns}</p>
          </section>

          {/* Stats Section */}
          <section className="space-y-8">
            <StatSection stats={player.characterStats} />
            <StatSection title="World" stats={storyState.worldStats} />
          </section>

          <button
            className="mt-auto text-gray-600 hover:text-red-600 transition-colors py-2 px-4 text-sm"
            onClick={onExitGame}
          >
            Exit story
          </button>
        </aside>

        {/* Main Content */}
        <main className="flex-1 bg-white rounded-lg shadow-sm p-6 overflow-y-auto">
          <StoryDisplay onChoiceSelected={onChoiceSelected} />
        </main>
      </div>
    </div>
  );
}
