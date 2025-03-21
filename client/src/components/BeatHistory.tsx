interface BeatHistoryProps {
  currentBeatIndex: number;
  totalBeats: number;
  pendingBeat: boolean;
  onBeatChange: (index: number) => void;
}

export function BeatHistory({
  currentBeatIndex,
  totalBeats,
  pendingBeat,
  onBeatChange,
}: BeatHistoryProps) {
  // Total count including pending beat
  const displayTotalBeats = pendingBeat ? totalBeats + 1 : totalBeats;

  // Determine if previous/next buttons should be visible
  const showPreviousButton = currentBeatIndex > 0;
  const showNextButton = currentBeatIndex < displayTotalBeats - 1;

  return (
    <div className="py-2">
      <div className="flex items-center justify-center space-x-4">
        {showPreviousButton ? (
          <button
            onClick={() => onBeatChange(currentBeatIndex - 1)}
            className="p-2 rounded-lg hover:bg-primary-50 text-primary"
            aria-label="Previous beat"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
        ) : (
          // Empty div to maintain spacing when button is hidden
          <div className="w-9 h-9"></div>
        )}

        <span className="text-sm text-primary-600">
          Beat {currentBeatIndex + 1} of {displayTotalBeats}
        </span>

        {showNextButton ? (
          <button
            onClick={() => onBeatChange(currentBeatIndex + 1)}
            className="p-2 rounded-lg hover:bg-primary-50 text-primary"
            aria-label="Next beat"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          </button>
        ) : (
          // Empty div to maintain spacing when button is hidden
          <div className="w-9 h-9"></div>
        )}
      </div>
    </div>
  );
}
