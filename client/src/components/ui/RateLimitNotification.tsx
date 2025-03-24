import { useEffect, useState, useCallback, memo, useRef } from "react";
import { RateLimitInfo } from "../../../../shared/types/websocket";
import { Notification } from "./Notification";

interface RateLimitNotificationProps {
  rateLimit: RateLimitInfo;
  onTimeout?: () => void;
  className?: string;
}

export const RateLimitNotification = memo(function RateLimitNotification({
  rateLimit,
  onTimeout,
  className = "",
}: RateLimitNotificationProps) {
  // Track if this is the first render
  const isFirstRender = useRef(true);

  // Log only on first render, while keeping the dependency array correct
  useEffect(() => {
    if (isFirstRender.current) {
      // Only log on first mount
      console.log("[RateLimitNotification] Mounted with data:", rateLimit);
      isFirstRender.current = false;
    }
  }, [rateLimit]);

  // Store the initial time remaining in a ref to prevent reset on re-renders
  const initialTimeRef = useRef<number>(rateLimit.timeRemaining || 30000);

  // Initialize countdown only once with the initialTimeRef
  const [countdown, setCountdown] = useState<number>(initialTimeRef.current);

  // Set up countdown timer
  useEffect(() => {
    if (countdown <= 0) {
      onTimeout?.();
      return;
    }

    const timer = setInterval(() => {
      setCountdown((prev) => Math.max(0, prev - 1000));
    }, 1000);

    return () => clearInterval(timer);
  }, [countdown, onTimeout]);

  const formatTime = useCallback((ms: number) => {
    if (ms >= 60000) {
      const minutes = Math.floor(ms / 60000);
      const seconds = Math.floor((ms % 60000) / 1000);
      return `${minutes}:${seconds.toString().padStart(2, "0")}`;
    } else {
      const seconds = Math.ceil(ms / 1000);
      return `${seconds}s`;
    }
  }, []);

  const getMessage = useCallback(() => {
    if (!rateLimit) {
      return <p>Rate limit exceeded. Please try again later.</p>;
    }

    const action = rateLimit.action;
    const timeLeft = formatTime(countdown);

    if (!action) {
      return (
        <p>
          Rate limit exceeded. Please try again in{" "}
          <span className="font-medium">{timeLeft}</span>.
        </p>
      );
    }

    switch (action) {
      case "initialize_story": {
        const maxRequests = rateLimit.maxRequests;
        const windowMs = rateLimit.windowMs;

        if (!maxRequests || !windowMs) {
          return (
            <p>
              Story creation is limited. Please try again in{" "}
              <span className="font-medium">{timeLeft}</span>.
            </p>
          );
        }

        const windowMinutes = Math.floor(windowMs / 60000);
        return (
          <>
            <p>
              To keep our servers running smoothly during this free alpha, we
              limit new story creation to {maxRequests} per {windowMinutes}{" "}
              {windowMinutes === 1 ? "minute" : "minutes"}.
            </p>
            <p className="mt-2">
              You can create a new story in{" "}
              <span className="font-medium">{timeLeft}</span>.
            </p>
          </>
        );
      }

      case "make_choice": {
        const maxRequests = rateLimit.maxRequests;
        const windowMs = rateLimit.windowMs;

        if (!maxRequests || !windowMs) {
          return (
            <p>
              Please wait before making another choice. Try again in{" "}
              <span className="font-medium">{timeLeft}</span>.
            </p>
          );
        }

        const windowSeconds = Math.floor(windowMs / 1000);
        return (
          <>
            <p className="mt-2">
              Story choices are limited to {maxRequests} every {windowSeconds}{" "}
              seconds.
            </p>
            <p className="mt-2">
              You can make another choice in{" "}
              <span className="font-bold text-lg">{timeLeft}</span>
            </p>
          </>
        );
      }

      default:
        return (
          <p>
            Please try again in <span className="font-medium">{timeLeft}</span>.
          </p>
        );
    }
  }, [countdown, formatTime, rateLimit]);

  // Determine notification type based on action
  const getNotificationType = () => {
    if (rateLimit && rateLimit.action === "make_choice") {
      return "warning";
    } else if (rateLimit && rateLimit.action === "initialize_story") {
      return "info";
    }
    return "warning";
  };

  // Determine title based on action
  const getTitle = () => {
    return "Spam protection";
  };

  return (
    <Notification
      type={getNotificationType()}
      title={getTitle()}
      message={getMessage()}
      onClose={onTimeout}
      className={className}
      autoClose={false}
    />
  );
});
