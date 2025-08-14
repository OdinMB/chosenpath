import React, { useState } from "react";
import { PrimaryButton, Modal, Icons } from "components/ui";

type AcademyContextButtonMode = "button" | "icon";

interface AcademyContextButtonProps {
  mode?: AcademyContextButtonMode; // "button" (default) or "icon"
  content: React.ReactNode; // Content to display inside the modal
  link?: string; // Optional lecture link
  className?: string;
}

export const AcademyContextButton: React.FC<AcademyContextButtonProps> = ({
  mode = "button",
  content,
  link,
  className = "",
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleOpen = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setIsOpen(true);
  };

  const handleClose = () => setIsOpen(false);

  const handleVisit = () => {
    if (link) {
      window.open(link, "_blank", "noopener,noreferrer");
    }
  };

  const trigger =
    mode === "icon" ? (
      <button
        type="button"
        onClick={handleOpen}
        className={`text-blue-500 hover:text-blue-700 ${className}`}
        aria-label="Open Academy Context"
        title="Learn more"
      >
        <Icons.Academy className="h-5 w-5" />
      </button>
    ) : (
      <PrimaryButton
        onClick={handleOpen}
        variant="secondary"
        size="sm"
        className={className}
        leftIcon={<Icons.Academy className="h-4 w-4" />}
        title="Learn more"
      >
        Academy
      </PrimaryButton>
    );

  return (
    <>
      {trigger}
      <Modal
        isOpen={isOpen}
        onClose={handleClose}
        width="lg"
        headerImageSrc="/worldbuilding-academy.jpeg"
        headerImageAlt="Worldbuilding Academy"
      >
        <div className="space-y-4">
          <div className="text-primary-800 text-sm">{content}</div>
          {link && (
            <div className="flex justify-center pt-2">
              <PrimaryButton
                onClick={handleVisit}
                variant="outline"
                leftBorder={false}
                leftIcon={<Icons.Academy className="h-4 w-4" />}
              >
                Visit Lecture
              </PrimaryButton>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
};
