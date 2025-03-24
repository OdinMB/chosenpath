import { ReactNode, useEffect, useState } from "react";

type NotificationType = "info" | "warning" | "error" | "success";

interface NotificationProps {
  type?: NotificationType;
  title: string;
  message: ReactNode;
  onClose?: () => void;
  autoClose?: boolean;
  autoCloseTime?: number;
  className?: string;
}

export function Notification({
  type = "info",
  title,
  message,
  onClose,
  autoClose = false,
  autoCloseTime = 5000,
  className = "",
}: NotificationProps) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    if (autoClose && onClose) {
      const timer = setTimeout(() => {
        setIsVisible(false);
        const animationTimer = setTimeout(() => {
          onClose();
        }, 300); // Wait for fade out animation
        return () => clearTimeout(animationTimer);
      }, autoCloseTime);

      return () => clearTimeout(timer);
    }
  }, [autoClose, autoCloseTime, onClose]);

  // Configuration based on notification type
  const config = {
    info: {
      borderColor: "border-accent",
      bgColor: "bg-accent/10",
      iconColor: "text-accent",
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-8 w-8"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
            clipRule="evenodd"
          />
        </svg>
      ),
    },
    warning: {
      borderColor: "border-secondary",
      bgColor: "bg-accent/10",
      iconColor: "text-secondary",
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-8 w-8"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
            clipRule="evenodd"
          />
        </svg>
      ),
    },
    error: {
      borderColor: "border-red-500",
      bgColor: "bg-red-50",
      iconColor: "text-red-500",
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-8 w-8"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
            clipRule="evenodd"
          />
        </svg>
      ),
    },
    success: {
      borderColor: "border-green-500",
      bgColor: "bg-green-50",
      iconColor: "text-green-500",
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-8 w-8"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
            clipRule="evenodd"
          />
        </svg>
      ),
    },
  };

  const { borderColor, bgColor, iconColor, icon } = config[type];

  return (
    <div
      className={`
        transition-opacity duration-300 ease-in-out 
        ${isVisible ? "opacity-100" : "opacity-0"}
        rounded-lg border-l-4 ${borderColor} ${bgColor} p-4 font-lora shadow-xl
        ${className}
      `}
    >
      <div className="flex items-start">
        <div className={`flex-shrink-0 ${iconColor}`}>{icon}</div>
        <div className="ml-3 flex-1">
          <h3 className="text-base font-medium text-primary-800">{title}</h3>
          <div className="mt-1 text-sm text-primary-700">{message}</div>
        </div>
        <div className="ml-auto pl-3">
          <button
            onClick={() => {
              setIsVisible(false);
              setTimeout(() => onClose && onClose(), 300);
            }}
            className="inline-flex rounded-md text-primary-500 hover:text-primary-700 focus:outline-none"
            aria-label="Close"
          >
            <span className="sr-only">Close</span>
            <svg
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
