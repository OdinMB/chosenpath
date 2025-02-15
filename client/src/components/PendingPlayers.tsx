import type { PlayerSlot } from "../../../shared/types/players.js";

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
  if (pendingPlayers.length === 0) {
    return (
      <div className="rounded-md bg-gray-50 p-3">
        <div className="flex items-center gap-2">
          <svg
            className="animate-spin h-4 w-4 text-gray-600"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <p className="text-sm text-gray-600">Generating next story beat...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-md bg-gray-50 p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-sm font-medium text-gray-700">
          Waiting for {pendingPlayers.length}/{numberOfPlayers}:
        </span>
        {pendingPlayers.map((slot) => (
          <span
            key={slot}
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
              slot === currentPlayer
                ? "bg-blue-100 text-blue-700"
                : "bg-gray-100 text-gray-600"
            }`}
          >
            {slot === currentPlayer
              ? "You"
              : `Player ${slot.replace("player", "")}`}
          </span>
        ))}
      </div>
    </div>
  );
}
