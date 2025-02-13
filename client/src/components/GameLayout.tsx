import { useSession } from "../hooks/useSession";
import { StatDisplay } from "./StatDisplay";
import { StoryDisplay } from "./StoryDisplay";

interface Props {
  onExitGame: () => void;
  onChoiceSelected: (optionIndex: number) => void;
}

export function GameLayout({ onExitGame, onChoiceSelected }: Props) {
  const { storyState } = useSession();

  if (!storyState) {
    return null;
  }

  const { player, stats } = storyState;
  const visibleStats = stats.filter((stat) => stat.isVisible !== false);

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="mx-auto max-w-7xl flex gap-4 h-[calc(100vh-2rem)]">
        {/* Sidebar */}
        <aside className="w-80 bg-white rounded-lg shadow-sm p-4 flex flex-col">
          {/* Character Section */}
          <section className="mb-6 pb-4">
            <h2 className="text-xl font-semibold text-gray-900 mb-1 text-center">
              {player.name}
            </h2>
            <p className="text-gray-600 text-center">{player.pronouns}</p>
          </section>

          {/* Stats Section */}
          <section className="space-y-3">
            {visibleStats.map((stat) => (
              <StatDisplay
                key={stat.id}
                name={stat.name}
                value={stat.value}
                type={stat.type}
              />
            ))}
            {visibleStats.length === 0 && (
              <div className="text-gray-500 italic">No stats available</div>
            )}
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
