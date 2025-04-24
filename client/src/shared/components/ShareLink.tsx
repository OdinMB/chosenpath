import React, { useState } from "react";
import { Icons, PrimaryButton } from "./ui";
import { ShareModal } from "./index";

interface ShareLinkProps {
  templateId: string;
  className?: string;
  showText?: boolean;
  buttonVariant?: "icon" | "primary-outline";
}

export const ShareLink: React.FC<ShareLinkProps> = ({
  templateId,
  className = "",
  showText = false,
  buttonVariant = "icon",
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Create the share URL using the current domain and template ID
  const shareUrl = `${window.location.origin}/share/template/${templateId}`;

  const handleOpenModal = (e: React.MouseEvent) => {
    e.preventDefault(); // Prevent form submission
    e.stopPropagation(); // Stop event propagation
    setIsModalOpen(true);
  };

  return (
    <>
      {buttonVariant === "icon" ? (
        <button
          onClick={handleOpenModal}
          className={`text-secondary hover:text-secondary-700 transition-colors ${className}`}
          aria-label="Share this template"
          title="Share this template"
          type="button"
        >
          <Icons.Share className="h-5 w-5" />
          {showText && <span className="ml-1">Share</span>}
        </button>
      ) : (
        buttonVariant === "primary-outline" && (
          <PrimaryButton
            onClick={handleOpenModal}
            variant="outline"
            leftBorder={false}
            leftIcon={<Icons.Share className="h-4 w-4" />}
            className={`h-full ${className}`}
            type="button"
            size="lg"
          >
            {showText ? "Share" : ""}
          </PrimaryButton>
        )
      )}

      <ShareModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        shareUrl={shareUrl}
      />
    </>
  );
};
