import React, { useState } from "react";
import { Icons } from "./ui";
import { ShareModal } from "./ShareModal";

interface ShareLinkProps {
  templateId: string;
  className?: string;
  showText?: boolean;
}

export const ShareLink: React.FC<ShareLinkProps> = ({
  templateId,
  className = "",
  showText = false,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Create the share URL using the current domain and template ID
  const shareUrl = `${window.location.origin}/share/template/${templateId}`;

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        className={`text-secondary hover:text-secondary-700 transition-colors ${className}`}
        aria-label="Share this template"
        title="Share this template"
      >
        <Icons.Share className="h-5 w-5" />
        {showText && <span className="ml-1">Share</span>}
      </button>

      <ShareModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        shareUrl={shareUrl}
      />
    </>
  );
};
