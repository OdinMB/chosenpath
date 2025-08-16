import React, { useState } from "react";
import { PrimaryButton, Icons } from "components/ui";
import { AcademyModal } from "./AcademyModal";

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
      <AcademyModal
        isOpen={isOpen}
        onClose={handleClose}
        content={content}
        link={link}
      />
    </>
  );
};
