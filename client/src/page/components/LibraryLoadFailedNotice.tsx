import { Icons, Notification, PrimaryButton } from "components/ui";

interface LibraryLoadFailedNoticeProps {
  onRetry: () => void;
  /** The library is being loaded again */
  isRetrying: boolean;
}

/**
 * Shown in place of the library's filters and templates when the templates
 * couldn't be loaded, so an empty library isn't mistaken for filters that
 * match nothing. An alert, so a screen reader announces it.
 */
export function LibraryLoadFailedNotice({
  onRetry,
  isRetrying,
}: LibraryLoadFailedNoticeProps) {
  return (
    <div role="alert">
      <Notification
        type="error"
        title="We couldn't load the library"
        dismissible={false}
        message={
          <>
            <p>
              We couldn't load the story templates. Check your connection and
              try again in a moment.
            </p>
            <PrimaryButton
              onClick={onRetry}
              isLoading={isRetrying}
              className="mt-3 min-h-[44px]"
              leftIcon={<Icons.Refresh className="h-4 w-4" />}
            >
              Retry
            </PrimaryButton>
          </>
        }
      />
    </div>
  );
}
