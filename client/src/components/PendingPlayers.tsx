import type { PlayerSlot } from "../../../shared/types/players.js";

interface PendingPlayersProps {
  pendingPlayers: PlayerSlot[];
  currentPlayer: PlayerSlot;
}

export function PendingPlayers({
  pendingPlayers,
  currentPlayer,
}: PendingPlayersProps) {
  if (pendingPlayers.length === 0) {
    return (
      <div className="rounded-md bg-gray-50 p-3">
        <p className="text-sm text-gray-600">
          All players have made their choices
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-md bg-gray-50 p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-sm font-medium text-gray-700">Waiting for</span>
        {pendingPlayers.map((slot) => (
          <span
            key={slot}
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
              slot === currentPlayer
                ? "bg-blue-100 text-blue-700"
                : "bg-gray-100 text-gray-600"
            }`}
          >
            Player {slot.replace("player", "")}
            {slot === currentPlayer && " (You)"}
          </span>
        ))}
      </div>
    </div>
  );
}
