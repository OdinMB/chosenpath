import React, { useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Icons } from "./Icons";

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
  width?: "sm" | "md" | "lg" | "xl" | "2xl" | "5xl" | "full";
  showCloseButton?: boolean;
  closeOnBackdropClick?: boolean;
  fullScreen?: boolean;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  className = "",
  width = "md",
  showCloseButton = true,
  closeOnBackdropClick = true,
  fullScreen = false,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleEscapeKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscapeKey);
    return () => {
      document.removeEventListener("keydown", handleEscapeKey);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (closeOnBackdropClick && e.target === e.currentTarget) {
      onClose();
    }
  };

  const widthClasses = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
    xl: "max-w-xl",
    "2xl": "max-w-2xl",
    "5xl": "max-w-5xl",
    full: "max-w-full mx-4",
  };

  const modalContent = (
    <div
      className={`fixed inset-0 bg-black/50 flex items-center justify-center ${
        fullScreen ? "z-[9999]" : "z-50"
      } overflow-y-auto`}
      onClick={handleBackdropClick}
      style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0 }}
    >
      <div
        ref={modalRef}
        className={`relative bg-white rounded-lg shadow-xl w-full ${widthClasses[width]} ${className}`}
      >
        {(title || showCloseButton) && (
          <div className="flex justify-between items-center p-4 border-b">
            {title && <h2 className="text-lg font-medium">{title}</h2>}
            {showCloseButton && (
              <button
                onClick={onClose}
                className="text-gray-500 hover:text-gray-700 ml-auto"
                aria-label="Close"
              >
                <Icons.Close className="h-5 w-5" />
              </button>
            )}
          </div>
        )}
        <div className="p-4">{children}</div>
      </div>
    </div>
  );

  // Use createPortal to render the modal at the document body level
  return createPortal(modalContent, document.body);
};
