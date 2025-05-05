import { Icons } from "components/ui";

interface BeatHistoryProps {
  currentBeatIndex: number;
  totalBeats: number;
  pendingBeat: boolean; // Whether the next beat is a placeholder
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

  // Ensure currentBeatIndex is within bounds
  const normalizedCurrentBeatIndex = Math.min(
    Math.max(0, safeCurrentBeatIndex),
    safeTotalBeats - 1
  );

  // Determine if previous/next buttons should be visible
  const showPreviousButton = normalizedCurrentBeatIndex > 0;
  const showNextButton = normalizedCurrentBeatIndex < safeTotalBeats - 1;

  // When navigating to a different beat, validate the index is in range
  const handleBeatChange = (index: number) => {
    // Ensure index is within valid range
    if (index >= 0 && index < safeTotalBeats) {
      onBeatChange(index);
    }
  };

  return (
    <div className="py-2">
      <div className="flex items-center justify-center space-x-4">
        {showPreviousButton ? (
          <button
            onClick={() => handleBeatChange(normalizedCurrentBeatIndex - 1)}
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
          Beat {normalizedCurrentBeatIndex + 1} of {safeTotalBeats}
          {pendingBeat &&
            normalizedCurrentBeatIndex === safeTotalBeats - 1 &&
            " (Next)"}
        </span>

        {showNextButton ? (
          <button
            onClick={() => handleBeatChange(normalizedCurrentBeatIndex + 1)}
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
