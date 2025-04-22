import { memo } from "react";
import { ContentModerationInfo } from "core/types";
import { Notification } from "./ui";

interface ContentModerationNotificationProps {
  contentModeration: ContentModerationInfo;
  onClose?: () => void;
  className?: string;
}

export const ContentModerationNotification = memo(
  function ContentModerationNotification({
    contentModeration,
    onClose,
    className = "",
  }: ContentModerationNotificationProps) {
    const getMessage = () => {
      if (!contentModeration) {
        return <p>Your content was flagged by our moderation system.</p>;
      }

      const { reason, action } = contentModeration;

      if (action === "initialize_story") {
        return (
          <>
            <p>
              We couldn't create your story because the prompt contains content
              that doesn't meet our community guidelines.
            </p>
            <p className="mt-3 font-semibold">Reason:</p>
            <p className="mt-1 italic">{reason}</p>
            <p className="mt-3">
              Please try again with a different prompt. We don't allow content
              that includes explicit adult themes, violence, abuse, or other
              harmful content.
            </p>
          </>
        );
      }

      return (
        <>
          <p>
            Your content was flagged by our moderation system and could not be
            processed.
          </p>
          <p className="mt-3 font-semibold">Reason:</p>
          <p className="mt-1 italic">{reason}</p>
        </>
      );
    };

    // Determine notification type
    const getNotificationType = () => {
      return "error" as const;
    };

    // Determine title
    const getTitle = () => {
      return "Content Moderation";
    };

    return (
      <Notification
        type={getNotificationType()}
        title={getTitle()}
        message={getMessage()}
        onClose={onClose}
        className={className}
        autoClose={false}
      />
    );
  }
);
