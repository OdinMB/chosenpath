import { PrimaryButton } from "components/ui";

// Ties the error message to the story-code field for screen readers
const ERROR_ID = "story-code-error";

interface JoinGameFormProps {
  code: string;
  /** The code has the format of a story code */
  isCodeValid: boolean;
  isValidating: boolean;
  validationError: string | null;
  onCodeChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSubmit: (e: React.FormEvent) => void;
}

/** The home page's "Join Game" form: a story code and its check. */
export function JoinGameForm({
  code,
  isCodeValid,
  isValidating,
  validationError,
  onCodeChange,
  onSubmit,
}: JoinGameFormProps) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <div className="flex flex-row gap-3 w-full">
          <div className="flex-grow min-w-0 relative">
            <label htmlFor="code" className="sr-only">
              Story code
            </label>
            <input
              id="code"
              type="text"
              value={code}
              onChange={onCodeChange}
              className={`w-full h-10 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent focus:border-accent bg-white text-primary shadow-sm placeholder-primary-400 ${
                validationError
                  ? "border-red-300"
                  : isCodeValid
                  ? "border-green-300"
                  : "border-primary-100"
              }`}
              placeholder="Story code"
              disabled={isValidating}
              aria-invalid={validationError ? true : undefined}
              aria-describedby={validationError ? ERROR_ID : undefined}
            />
            {isCodeValid && !validationError && (
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                <svg
                  className="w-4 h-4 text-green-500"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
            )}
          </div>
          <PrimaryButton
            type="submit"
            disabled={!isCodeValid || isValidating}
            className="whitespace-nowrap min-w-[90px] relative"
          >
            {isValidating ? (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Joining...</span>
              </div>
            ) : (
              "Join Game"
            )}
          </PrimaryButton>
        </div>
        {validationError && (
          <p id={ERROR_ID} role="alert" className="text-red-600 text-sm px-1">
            {validationError}
          </p>
        )}
      </div>
    </form>
  );
}
