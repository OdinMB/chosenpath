import { PrimaryButton, Icons } from "components/ui";

interface StorySetupFailedProps {
  /** Sends the same premise and settings again. */
  onRetry: () => void;
  /** Back to the form the story was started from. */
  onBack: () => void;
}

/**
 * Shown in place of the waiting screen when a story's setup failed for good
 * (the server's status poll says "failed", or it stopped answering). A
 * content-filter refusal never gets here: that request is refused up front and
 * shows its own moderation message.
 */
export function StorySetupFailed({ onRetry, onBack }: StorySetupFailedProps) {
  return (
    <div className="p-4 font-lora">
      <div
        role="alert"
        className="max-w-2xl mx-auto bg-white rounded-lg border border-primary-100 border-l-4 border-l-tertiary shadow-md p-6 text-center animate-fadeIn"
      >
        <span aria-hidden="true" className="block">
          <Icons.AlertCircle className="h-8 w-8 text-tertiary mx-auto mb-3" />
        </span>
        <h2 className="text-xl md:text-2xl font-medium text-primary mb-2">
          We couldn't create this story.
        </h2>
        <p className="text-primary-600 mb-6">Please try again.</p>
        <div className="flex flex-row gap-3 sm:gap-4 justify-center">
          <PrimaryButton
            type="button"
            size="lg"
            onClick={onBack}
            variant="outline"
            leftBorder={false}
            leftIcon={<Icons.ArrowLeft className="h-4 w-4" />}
          >
            Back
          </PrimaryButton>
          <PrimaryButton
            type="button"
            size="lg"
            onClick={onRetry}
            className="font-semibold flex-1 sm:flex-none sm:min-w-[120px]"
          >
            Try again
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}
