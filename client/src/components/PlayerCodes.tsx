import { AppTitle } from "./AppTitle";

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

  const isSinglePlayer = Object.keys(codes).length === 1;
  const singlePlayerCode = isSinglePlayer ? Object.values(codes)[0] : null;

  return (
    <div className="min-h-screen p-4 md:p-6 font-lora">
      <div className="max-w-2xl mx-auto">
        <AppTitle size="large" className="mb-10" />

        <div className="p-6 bg-white rounded-lg border border-primary-100 shadow-md mb-6">
          <h2 className="text-xl font-semibold text-primary mb-4">
            Your Story is Ready!
          </h2>

          {!isSinglePlayer && (
            <div className="bg-primary-50 border-l-4 border-primary-200 p-4 mb-6 rounded-md">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg
                    className="h-5 w-5 text-primary-600"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-primary-700">
                    Save these codes! Each player will need their code to access
                    their character.
                  </p>
                </div>
              </div>
            </div>
          )}

          {isSinglePlayer ? (
            <>
              <div className="mb-8 text-center">
                <div className="mb-2 text-primary-700 text-sm">
                  Your Access Code:
                </div>
                <div className="h-12 px-4 py-2 border rounded-lg border-primary-100 bg-white text-primary shadow-sm font-mono flex items-center justify-center text-lg">
                  {singlePlayerCode}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 pt-2">
                <button
                  onClick={onBack}
                  className="w-full sm:w-1/3 py-2.5 md:py-3 px-4 rounded-lg text-sm md:text-base font-medium text-primary bg-white border border-primary-100 hover:bg-primary-50 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-opacity-50 transition-colors duration-200 shadow-sm"
                >
                  Back
                </button>

                <button
                  onClick={() => onCodeSubmit(singlePlayerCode!)}
                  className="w-full sm:w-2/3 py-2.5 md:py-3 px-4 rounded-lg text-sm md:text-base font-semibold text-primary bg-white border-l-8 border border-accent shadow-md hover:border-l-8 hover:border-secondary hover:shadow-lg hover:translate-x-1 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-opacity-50 transition-all duration-300"
                >
                  Join the Story
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-4 mb-8">
                {Object.entries(codes).map(([slot, code]) => (
                  <div
                    key={slot}
                    className="border rounded-lg p-4 bg-white border-primary-100 shadow-sm"
                  >
                    <h3 className="font-medium text-primary mb-2">
                      {formatPlayerName(slot)}
                    </h3>
                    <div className="flex items-center justify-between">
                      <div className="h-10 px-4 py-2 border rounded-lg border-primary-100 bg-white text-primary shadow-sm font-mono flex items-center">
                        {code}
                      </div>
                      <button
                        onClick={() => onCodeSubmit(code)}
                        className="ml-4 px-4 py-2 text-sm font-medium text-primary bg-white border-l-4 border border-accent shadow-sm hover:border-l-4 hover:border-secondary hover:shadow-md hover:translate-x-1 rounded-md transition-all duration-300"
                      >
                        Join the Story
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-center">
                <button
                  onClick={onBack}
                  className="px-4 py-2 text-sm font-medium text-primary bg-white border border-primary-100 hover:bg-primary-50 rounded-md shadow-sm transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-opacity-50"
                >
                  Back
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
