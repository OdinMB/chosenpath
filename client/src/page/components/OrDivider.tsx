interface OrDividerProps {
  className?: string;
}

export function OrDivider({ className = "" }: OrDividerProps) {
  return (
    <div className={`relative ${className}`}>
      <div className="absolute inset-0 flex items-center">
        <div className="w-full border-t border-primary-100"></div>
      </div>
      <div className="relative flex justify-center text-sm">
        <span className="px-2 bg-white text-primary-600">or</span>
      </div>
    </div>
  );
}
