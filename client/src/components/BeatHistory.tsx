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

  return (
    <div className="py-2">
      <div className="flex items-center justify-center space-x-4">
        <button
          onClick={() => onBeatChange(currentBeatIndex - 1)}
          disabled={currentBeatIndex === 0}
          className="p-2 rounded-lg disabled:opacity-50 hover:bg-primary-50 text-primary"
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

        <span className="text-sm text-primary-600">
          Beat {currentBeatIndex + 1} of {displayTotalBeats}
        </span>

        <button
          onClick={() => onBeatChange(currentBeatIndex + 1)}
          disabled={currentBeatIndex >= displayTotalBeats - 1}
          className="p-2 rounded-lg disabled:opacity-50 hover:bg-primary-50 text-primary"
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
      </div>
    </div>
  );
}
