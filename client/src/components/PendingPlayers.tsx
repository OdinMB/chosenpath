import type { PlayerSlot } from "../../../shared/types/player.js";
import { useSession } from "../hooks/useSession";

interface PendingPlayersProps {
  pendingPlayers: PlayerSlot[];
  currentPlayer: PlayerSlot;
  numberOfPlayers: number;
}

export function PendingPlayers({
  pendingPlayers,
  currentPlayer,
  numberOfPlayers,
}: PendingPlayersProps) {
  const { storyState } = useSession();
  const isCharacterSelectionPhase =
    storyState && !storyState.characterSelectionCompleted;

  const showLoadingSpinner = pendingPlayers.length === 0;
  const showPendingPlayers = numberOfPlayers >= 2 && pendingPlayers.length > 0;

  if (!showLoadingSpinner && !showPendingPlayers) {
    return null;
  }

  return (
    <div className="rounded-lg bg-white p-3 border border-primary-100 shadow-md">
      {showLoadingSpinner && (
        <div className="flex items-center gap-2">
          <div className="animate-spin h-4 w-4 rounded-full border-2 border-primary-100 border-t-accent border-r-secondary"></div>
          <p className="text-sm text-primary-700">
            {isCharacterSelectionPhase
              ? "Waiting for all players to select characters..."
              : "Generating next story beat..."}
          </p>
        </div>
      )}

      {showPendingPlayers && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-medium text-primary mr-2">
            Waiting for
          </span>
          {pendingPlayers.map((slot) => (
            <span
              key={slot}
              className={`inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded border ${
                slot === currentPlayer
                  ? "border-l-4 border-secondary bg-white text-primary shadow-sm"
                  : "border border-primary-100 bg-white text-primary-700 shadow-sm"
              }`}
            >
              {slot === currentPlayer
                ? "You"
                : `Player ${slot.replace("player", "")}`}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
