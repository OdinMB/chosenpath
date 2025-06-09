import React, { useState } from "react";
import { Icons, PrimaryButton, Modal } from "./ui";

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

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Share Link" width="md">
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
    </Modal>
  );
};

export default ShareModal;
