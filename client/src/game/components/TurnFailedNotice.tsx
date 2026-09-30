import { Icons, Notification, PrimaryButton } from "components/ui";
import type { TurnFailure } from "game/turnFailure";

interface TurnFailedNoticeProps {
  failure: TurnFailure;
  onTryAgain: () => void;
  className?: string;
}

/**
 * Shown where the game was waiting on a turn, choice or character selection
 * that failed: the server's line and "Try again". It stands in for the
 * spinner, so nothing on screen says the story is still being written, and it
 * has no close button, since closed it would leave the player waiting on
 * nothing. An alert, so a screen reader announces it when it appears.
 */
export function TurnFailedNotice({
  failure,
  onTryAgain,
  className = "",
}: TurnFailedNoticeProps) {
  return (
    <div role="alert" className={`w-full max-w-2xl mx-auto ${className}`}>
      <Notification
        type="error"
        title="Something went wrong"
        dismissible={false}
        message={
          <>
            <p>{failure.message}</p>
            <PrimaryButton
              onClick={onTryAgain}
              className="mt-3 min-h-[44px]"
              leftIcon={<Icons.Refresh className="h-4 w-4" />}
            >
              Try again
            </PrimaryButton>
          </>
        }
      />
    </div>
  );
}
