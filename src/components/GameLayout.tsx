import { useStory } from "../context/storyContext";
import { StoryDisplay } from "./StoryDisplay";

interface Props {
  onExitGame: () => void;
  onChoiceSelected: (optionIndex: number) => void;
}

export function GameLayout({ onExitGame, onChoiceSelected }: Props) {
  const { storyState } = useStory();

  if (!storyState) {
    return null; // or some loading state if needed
  }

  const { player, stats, currentTurn, maxTurns } = storyState;
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
            <p className="text-gray-600 text-center">
              {player.pronouns.subject}/{player.pronouns.object}
            </p>
          </section>

          {/* Stats Section */}
          <section className="mb-6 pb-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Stats</h2>
            <div className="space-y-2">
              {visibleStats.map((stat) => (
                <div
                  key={stat.name}
                  className="flex justify-between items-center p-2 bg-gray-50 rounded"
                >
                  <span className="text-gray-900 font-medium">{stat.name}</span>
                  <span className="text-gray-700">{String(stat.value)}</span>
                </div>
              ))}
              {visibleStats.length === 0 && (
                <div className="text-gray-500 italic">No stats available</div>
              )}
            </div>
          </section>

          {/* Turn Counter Section */}
          <section className="mb-6 pb-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">
              Turn Counter
            </h2>
            <div className="flex justify-between items-center p-2 bg-gray-50 rounded">
              <span className="text-gray-900 font-medium">Current Turn</span>
              <span className="text-gray-700">
                {currentTurn} / {maxTurns}
              </span>
            </div>
          </section>

          <button
            className="mt-auto w-full bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded transition-colors"
            onClick={onExitGame}
          >
            Exit Game
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
