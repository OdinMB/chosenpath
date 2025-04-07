import { ReactNode, useEffect, useState } from "react";
import { Icons } from "./Icons.js";

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
      icon: <Icons.Info className="h-8 w-8" />,
    },
    warning: {
      borderColor: "border-secondary",
      bgColor: "bg-accent/10",
      iconColor: "text-secondary",
      icon: <Icons.Warning />,
    },
    error: {
      borderColor: "border-red-500",
      bgColor: "bg-red-50",
      iconColor: "text-red-500",
      icon: <Icons.Error />,
    },
    success: {
      borderColor: "border-green-500",
      bgColor: "bg-green-50",
      iconColor: "text-green-500",
      icon: <Icons.Success />,
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
            <Icons.Close />
          </button>
        </div>
      </div>
    </div>
  );
}
