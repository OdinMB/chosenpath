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
  /** Optional image header at the top of the modal */
  headerImageSrc?: string;
  headerImageAlt?: string;
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
  headerImageSrc,
  headerImageAlt = "",
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
    full: "max-w-full",
  };

  const modalContent = (
    <div
      className={`fixed inset-0 bg-black/50 flex items-center justify-center ${
        fullScreen ? "z-[9999]" : "z-50"
      } overflow-y-auto ${fullScreen ? "" : "px-2 sm:px-0"}`}
      onClick={handleBackdropClick}
      style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0 }}
    >
      <div
        ref={modalRef}
        className={`relative bg-white rounded-lg shadow-xl w-full ${widthClasses[width]} ${className}`}
      >
        {headerImageSrc ? (
          <div className="relative w-full overflow-hidden rounded-t-lg">
            <img
              src={headerImageSrc}
              alt={headerImageAlt}
              className="w-full h-28 object-cover"
            />
            {showCloseButton && (
              <button
                onClick={onClose}
                className="absolute top-3 right-3 bg-white rounded-md shadow p-1 text-gray-700 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset transition-all duration-200"
                aria-label="Close"
              >
                <Icons.Close className="h-5 w-5" />
              </button>
            )}
          </div>
        ) : (
          (title || showCloseButton) && (
            <div className="flex justify-between items-center p-4 border-b">
              {title && <h2 className="text-lg font-medium">{title}</h2>}
              {showCloseButton && (
                <button
                  onClick={onClose}
                  className="text-gray-500 hover:text-gray-700 ml-auto focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset rounded p-1 transition-all duration-200"
                  aria-label="Close"
                >
                  <Icons.Close className="h-5 w-5" />
                </button>
              )}
            </div>
          )
        )}
        <div className="p-4">{children}</div>
      </div>
    </div>
  );

  // Use createPortal to render the modal at the document body level
  return createPortal(modalContent, document.body);
};
