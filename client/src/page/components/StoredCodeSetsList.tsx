import { StoredCodeSet } from "@common/SessionContext";
import { ConfirmDialog, Icons, PrimaryButton, Tooltip } from "@components/ui";
import { PlayerCode } from "@common/components";
import { useStoredCodeSets } from "../hooks/useStoredCodeSets";

// Helper function to format timestamp
function formatDate(timestamp: number): string {
  const date = new Date(timestamp);

  // Format the date as "Month Day"
  const monthName = date.toLocaleString("en-US", { month: "long" });
  const day = date.getDate();

  // Format the time
  const time = date.toLocaleString(undefined, { timeStyle: "short" });

  return `${monthName} ${day}, ${time}`;
}

// Helper function to format player label
function formatPlayerLabel(player: string, isFirstPlayer: boolean): string {
  if (isFirstPlayer) {
    return "You";
  }

  // Convert "player1" to "Player 1"
  const match = player.match(/player(\d+)/i);
  if (match && match[1]) {
    return `Player ${match[1]}`;
  }

  return player;
}

interface StoredCodeSetsListProps {
  onCodeSubmit: (code: string) => void;
}

export function StoredCodeSetsList({ onCodeSubmit }: StoredCodeSetsListProps) {
  const {
    codeSets,
    isConfirmDialogOpen,
    setIsConfirmDialogOpen,
    handleDeleteCodeSet,
    confirmDelete,
  } = useStoredCodeSets();

  if (codeSets.length === 0) {
    return null;
  }

  const handleJoinWithCodeSet = (codeSet: StoredCodeSet) => {
    // Play button defaults to first code - individual codes can be clicked directly
    const firstCode = Object.values(codeSet.codes)[0];
    if (firstCode) {
      onCodeSubmit(firstCode);
    }
  };

  return (
    <>
      <ConfirmDialog
        isOpen={isConfirmDialogOpen}
        onClose={() => setIsConfirmDialogOpen(false)}
        onConfirm={confirmDelete}
        title="Delete Story Codes"
        message="Are you sure you want to delete these story codes? This cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
      />

      <div className="flex flex-col gap-3">
        {codeSets.map((codeSet) => (
          <div
            key={codeSet.timestamp}
            className="w-full flex items-center justify-between gap-3 border rounded-lg border-primary-100 p-3 mt-2"
          >
            <div className="flex-1">
              <div className="text-sm font-medium text-primary-700">
                {codeSet.title || `Story from ${formatDate(codeSet.timestamp)}`}
              </div>
              <div className="text-xs text-primary-500 mt-1 space-y-1">
                {Object.entries(codeSet.codes).length === 1 ? (
                  // If only one code, display it without labels
                  <PlayerCode
                    code={Object.values(codeSet.codes)[0]}
                    size="sm"
                  />
                ) : (
                  // If multiple codes, display with proper labels
                  Object.entries(codeSet.codes).map(([player, code], index) => (
                    <PlayerCode
                      key={player}
                      code={code}
                      size="sm"
                      label={formatPlayerLabel(player, index === 0)}
                    />
                  ))
                )}
              </div>
            </div>
            <div className="flex gap-2 items-center">
              <PrimaryButton
                size="sm"
                onClick={() => handleJoinWithCodeSet(codeSet)}
              >
                {codeSet.lastActive ? "Resume" : "Play"}
              </PrimaryButton>
              <Tooltip content="Delete codes" position="bottom">
                <button
                  onClick={() => handleDeleteCodeSet(codeSet.timestamp)}
                  className="text-red-600 hover:text-red-700 focus:outline-none flex items-center"
                >
                  <Icons.Trash />
                </button>
              </Tooltip>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
