interface PlayerCodesProps {
  codes: Record<string, string>;
  onBack: () => void;
  onCodeSubmit: (code: string) => void;
}

export function PlayerCodes({ codes, onBack, onCodeSubmit }: PlayerCodesProps) {
  const formatPlayerName = (slot: string) => {
    // Convert "player1" to "Player 1"
    return slot.replace(/player(\d+)/, (_, num) => `Player ${num}`);
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-3xl font-bold text-gray-900 mb-6 text-center">
        Player Access Codes
      </h1>
      
      <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <p className="text-sm text-yellow-700">
              Save these codes! Each player will need their code to access their character.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4 mb-8">
        {Object.entries(codes).map(([slot, code]) => (
          <div key={slot} className="border rounded-lg p-4 bg-white shadow-sm">
            <h3 className="font-medium text-gray-900 mb-2">{formatPlayerName(slot)}</h3>
            <div className="flex items-center justify-between">
              <code className="text-sm bg-gray-100 px-3 py-1.5 rounded">
                {code}
              </code>
              <button
                onClick={() => onCodeSubmit(code)}
                className="ml-4 px-4 py-2 text-sm font-medium text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-md transition-colors duration-200"
              >
                Use Code
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-center">
        <button
          onClick={onBack}
          className="px-6 py-3 text-base font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition-colors duration-200"
        >
          Back to Welcome Screen
        </button>
      </div>
    </div>
  );
} 