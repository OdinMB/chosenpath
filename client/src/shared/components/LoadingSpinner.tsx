interface LoadingSpinnerProps {
  size?: "small" | "medium" | "large";
  className?: string;
}

export function LoadingSpinner({
  size = "medium",
  className = "",
}: LoadingSpinnerProps) {
  const sizeClasses = {
    small: "w-5 h-5",
    medium: "w-8 h-8",
    large: "w-12 h-12",
  };

  return (
    <div className={`flex justify-center items-center ${className}`}>
      <div
        className={`${sizeClasses[size]} border-t-2 border-b-2 border-secondary rounded-full animate-spin`}
      ></div>
    </div>
  );
}
