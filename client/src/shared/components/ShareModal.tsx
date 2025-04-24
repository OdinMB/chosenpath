import React, { useState } from "react";
import { Icons, PrimaryButton } from "./ui";

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  shareUrl: string;
}

const ShareModal: React.FC<ShareModalProps> = ({
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

  const handleCopyButton = (e: React.MouseEvent) => {
    e.preventDefault(); // Prevent form submission
    e.stopPropagation(); // Stop event propagation
    handleCopy();
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    // Only close if the click is directly on the backdrop
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={handleBackdropClick}
    >
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
          <div className="flex items-stretch">
            <input
              type="text"
              value={shareUrl}
              readOnly
              className="flex-1 p-2 border border-r-0 rounded-l-md text-sm bg-gray-50"
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
            <PrimaryButton
              onClick={handleCopyButton}
              variant="outline"
              leftBorder={false}
              className="rounded-l-none"
              aria-label="Copy to clipboard"
              type="button"
              rightIcon={
                copied ? (
                  <Icons.Check className="w-5 h-5" />
                ) : (
                  <Icons.Copy className="w-5 h-5" />
                )
              }
            />
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

export default ShareModal;
