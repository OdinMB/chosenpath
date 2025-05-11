import { useEffect, useState, useCallback, memo, useRef } from "react";
import { RateLimitInfo } from "core/types";
import { Notification } from "../components/ui";

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

    const timeLeft = formatTime(countdown);

    return (
      <p>
        Rate limit exceeded. Please try again in{" "}
        <span className="font-medium">{timeLeft}</span>.
      </p>
    );
  }, [countdown, formatTime, rateLimit]);

  // Determine title based on action
  const getTitle = () => {
    return "Spam protection";
  };

  return (
    <Notification
      type="warning"
      title={getTitle()}
      message={getMessage()}
      onClose={onTimeout}
      className={className}
      autoClose={false}
    />
  );
});
