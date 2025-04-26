import { useState, useEffect } from "react";
import { Icons, Tooltip } from "components/ui";
import { generateJoinLink } from "shared/utils/codeSetUtils";

export interface PlayerCodeProps {
  code: string;
  size?: "sm" | "md" | "lg";
  showCopyCode?: boolean;
  showShareLink?: boolean;
  label?: string | null;
}

export function PlayerCode({
  code,
  size = "md",
  showCopyCode = true,
  showShareLink = true,
  label = null,
}: PlayerCodeProps) {
  const [copiedItem, setCopiedItem] = useState<string | null>(null);

  // Clear copied status after 2 seconds
  useEffect(() => {
    if (copiedItem) {
      const timer = setTimeout(() => {
        setCopiedItem(null);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [copiedItem]);

  // Size-specific classes
  const getSizeClasses = () => {
    switch (size) {
      case "sm":
        return {
          container: "h-6 text-xs",
          code: "px-1.5 py-0.5",
          icon: "w-3.5 h-3.5",
          translateY: "translate-y-[2px]",
        };
      case "lg":
        return {
          container: "h-12 text-lg",
          code: "px-4 py-2",
          icon: "w-5 h-5",
          translateY: "translate-y-[2px]",
        };
      default: // md
        return {
          container: "h-10 text-sm",
          code: "px-3 py-1.5",
          icon: "w-4 h-4",
          translateY: "translate-y-[2px]",
        };
    }
  };

  const sizeClasses = getSizeClasses();

  const handleCopyCode = () => {
    navigator.clipboard.writeText(code);
    setCopiedItem("code");
  };

  const handleCopyJoinLink = () => {
    const joinLink = generateJoinLink(code);
    navigator.clipboard.writeText(joinLink);
    setCopiedItem("link");
  };

  return (
    <div className="flex items-center">
      {label && (
        <span className="font-medium text-primary-600 mr-2">{label}:</span>
      )}
      <div
        className={`${sizeClasses.container} ${sizeClasses.code} inline-flex items-center border rounded-lg border-primary-100 bg-white text-primary shadow-sm font-mono`}
      >
        {code}
      </div>

      <div className="flex ml-2">
        {showCopyCode && (
          <Tooltip content="Copy code" position="top">
            <button
              onClick={handleCopyCode}
              className={`text-primary-400 hover:text-primary-600 mr-1 ${sizeClasses.translateY}`}
              aria-label="Copy code"
            >
              <Icons.Clipboard className={sizeClasses.icon} />
            </button>
          </Tooltip>
        )}

        {showShareLink && (
          <Tooltip content="Copy join link" position="top">
            <button
              onClick={handleCopyJoinLink}
              className={`text-primary-400 hover:text-primary-600 ${sizeClasses.translateY}`}
              aria-label="Copy join link"
            >
              <Icons.Share className={sizeClasses.icon} />
            </button>
          </Tooltip>
        )}

        {copiedItem && (
          <span
            className={`ml-2 text-xs text-green-500 animate-fadeIn ${sizeClasses.translateY}`}
          >
            Copied!
          </span>
        )}
      </div>
    </div>
  );
}
