interface LoadingSpinnerProps {
  size?: "small" | "medium" | "large";
  message?: string;
  messageSize?: "normal" | "large";
}

export function LoadingSpinner({
  size = "medium",
  message,
  messageSize = "normal",
}: LoadingSpinnerProps) {
  const sizeClasses = {
    small: "h-8 w-8",
    medium: "h-16 w-16",
    large: "h-24 w-24",
  };

  const messageSizeClasses = {
    normal: "text-primary-700",
    large: "text-primary-700 text-lg md:text-xl font-medium",
  };

  return (
    <div className="flex flex-col items-center justify-center">
      <div
        className={`animate-spin rounded-full ${sizeClasses[size]} border-4 border-primary-100 border-t-accent border-r-secondary`}
      ></div>
      {message && (
        <p className={`mt-4 ${messageSizeClasses[messageSize]}`}>{message}</p>
      )}
    </div>
  );
}
