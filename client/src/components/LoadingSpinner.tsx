interface LoadingSpinnerProps {
  size?: "small" | "medium" | "large";
  message?: string;
}

export function LoadingSpinner({
  size = "medium",
  message,
}: LoadingSpinnerProps) {
  const sizeClasses = {
    small: "h-8 w-8",
    medium: "h-16 w-16",
    large: "h-24 w-24",
  };

  return (
    <div className="flex flex-col items-center justify-center">
      <div
        className={`animate-spin rounded-full ${sizeClasses[size]} border-4 border-gray-200 border-t-indigo-500`}
      ></div>
      {message && <p className="mt-4 text-gray-600">{message}</p>}
    </div>
  );
}
