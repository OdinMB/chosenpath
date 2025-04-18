import React, { useState } from "react";
import { Icons } from "./ui";

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  shareUrl: string;
}

export const ShareModal: React.FC<ShareModalProps> = ({
  isOpen,
  onClose,
  shareUrl,
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4 relative">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-500 hover:text-gray-700"
          aria-label="Close"
        >
          <Icons.Close className="w-5 h-5" />
        </button>

        <h3 className="text-lg font-medium text-primary mb-4">Share Story</h3>

        <div className="mb-4">
          <p className="text-sm text-gray-600 mb-1">
            Start a new story with this template:
          </p>
          <div className="flex items-center">
            <input
              type="text"
              value={shareUrl}
              readOnly
              className="flex-1 p-2 border rounded-l-md text-sm bg-gray-50"
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
            <button
              onClick={handleCopy}
              className="p-2 bg-primary hover:bg-primary-dark text-white rounded-r-md"
              aria-label="Copy to clipboard"
            >
              {copied ? (
                <Icons.Check className="w-5 h-5" />
              ) : (
                <Icons.Copy className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>

        {copied && (
          <div className="text-green-600 text-sm flex items-center">
            <Icons.Check className="w-4 h-4 mr-1" />
            Copied to clipboard!
          </div>
        )}
      </div>
    </div>
  );
};
