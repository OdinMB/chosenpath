import React from "react";
import { PrimaryButton, Modal, Icons } from "components/ui";

interface AcademyModalProps {
  isOpen: boolean;
  onClose: () => void;
  content: React.ReactNode;
  link?: string;
  title?: string;
  width?: "sm" | "md" | "lg" | "xl" | "2xl" | "5xl" | "full";
  showVisitButton?: boolean;
  visitButtonText?: string;
}

export const AcademyModal: React.FC<AcademyModalProps> = ({
  isOpen,
  onClose,
  content,
  link,
  title,
  width = "lg",
  showVisitButton = true,
  visitButtonText = "Visit Lecture",
}) => {
  const handleVisit = () => {
    if (link) {
      window.open(link, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      width={width}
      title={title}
      headerImageSrc="/worldbuilding-academy.jpeg"
      headerImageAlt="Worldbuilding Academy"
    >
      <div className="space-y-4">
        <div className="text-primary-800 text-sm">{content}</div>
        {link && showVisitButton && (
          <div className="flex justify-center pt-2">
            <PrimaryButton
              onClick={handleVisit}
              variant="primary"
              leftIcon={<Icons.Academy className="h-4 w-4" />}
            >
              {visitButtonText}
            </PrimaryButton>
          </div>
        )}
      </div>
    </Modal>
  );
};