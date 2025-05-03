import { Icons } from "components/ui";

interface BeatHistoryProps {
  currentBeatIndex: number;
  totalBeats: number;
  pendingBeat: boolean;
  onBeatChange: (index: number) => void;
}

export function BeatHistory({
  currentBeatIndex = 0,
  totalBeats = 0,
  pendingBeat = false,
  onBeatChange,
}: BeatHistoryProps) {
  // Ensure we have valid numbers
  const safeCurrentBeatIndex =
    typeof currentBeatIndex === "number" ? currentBeatIndex : 0;
  const safeTotalBeats = typeof totalBeats === "number" ? totalBeats : 0;

  // Total count including pending beat
  const displayTotalBeats = pendingBeat ? safeTotalBeats + 1 : safeTotalBeats;

  // Determine if previous/next buttons should be visible
  const showPreviousButton = safeCurrentBeatIndex > 0;
  const showNextButton = safeCurrentBeatIndex < displayTotalBeats - 1;

  return (
    <div className="py-2">
      <div className="flex items-center justify-center space-x-4">
        {showPreviousButton ? (
          <button
            onClick={() => onBeatChange(safeCurrentBeatIndex - 1)}
            className={`p-2 rounded-lg transition-colors ${"text-primary-600 hover:bg-primary-50"}`}
            aria-label="Previous beat"
          >
            <Icons.ArrowLeft className="w-5 h-5" />
          </button>
        ) : (
          // Empty div to maintain spacing when button is hidden
          <div className="w-9 h-9"></div>
        )}

        <span className="text-sm text-primary-600">
          Beat {safeCurrentBeatIndex + 1} of {displayTotalBeats}
        </span>

        {showNextButton ? (
          <button
            onClick={() => onBeatChange(safeCurrentBeatIndex + 1)}
            className={`p-2 rounded-lg transition-colors ${"text-primary-600 hover:bg-primary-50"}`}
            aria-label="Next beat"
          >
            <Icons.ArrowRight className="w-5 h-5" />
          </button>
        ) : (
          // Empty div to maintain spacing when button is hidden
          <div className="w-9 h-9"></div>
        )}
      </div>
    </div>
  );
}
