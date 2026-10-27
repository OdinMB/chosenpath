import { Icons, Notification, PrimaryButton } from "components/ui";
import type { LoadFailureNotice } from "game/storyLoadFailure";

interface StoryLoadFailedProps {
  notice: LoadFailureNotice;
  onTryAgain: () => void;
  onGoHome: () => void;
}

/**
 * The game page when it couldn't open its story (storyLoadFailure): what
 * happened and a way on, in place of the spinner that would otherwise turn
 * forever. No close button, since closed it would leave an empty page. An
 * alert, so a screen reader announces it when it replaces the spinner.
 */
export function StoryLoadFailed({
  notice,
  onTryAgain,
  onGoHome,
}: StoryLoadFailedProps) {
  return (
    <main className="app flex min-h-screen items-center justify-center px-4 py-8">
      <div role="alert" className="w-full max-w-md">
        <Notification
          type="error"
          title={notice.title}
          dismissible={false}
          message={
            <>
              <p>{notice.message}</p>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <PrimaryButton
                  onClick={onTryAgain}
                  className="min-h-[44px]"
                  leftIcon={<Icons.Refresh className="h-4 w-4" />}
                >
                  Try again
                </PrimaryButton>
                <PrimaryButton
                  variant="outline"
                  onClick={onGoHome}
                  className="min-h-[44px]"
                  leftIcon={<Icons.ArrowLeft className="h-4 w-4" />}
                >
                  Back to home
                </PrimaryButton>
              </div>
            </>
          }
        />
      </div>
    </main>
  );
}
