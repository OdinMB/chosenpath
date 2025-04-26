import React, { ReactNode } from "react";
import { PrimaryButton } from "./";

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: ReactNode;
  confirmText?: string;
  cancelText?: string;
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
}: ConfirmDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
        <h3 className="text-lg font-semibold text-primary mb-2">{title}</h3>
        <div className="text-primary-800 mb-6 whitespace-pre-line">
          {typeof message === "string" ? (
            <FormattedMessage content={message} />
          ) : (
            message
          )}
        </div>

        <div className="flex justify-end gap-3">
          <PrimaryButton onClick={onClose} variant="outline" leftBorder={false}>
            {cancelText}
          </PrimaryButton>
          <PrimaryButton
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmText}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}

/**
 * Simple component to format text with basic markdown-like syntax
 * Supports **bold** and newlines
 */
function FormattedMessage({ content }: { content: string }) {
  if (!content) return null;

  // Split by newlines to handle paragraphs
  const paragraphs = content.split("\n").filter((p) => p.trim() !== "");

  // Process bold text (**text**)
  const processBoldText = (text: string) => {
    // Split by bold markers
    const parts = text.split(/(\*\*.*?\*\*)/g);

    return parts.map((part, index) => {
      // Check if this part is bold text
      if (part.startsWith("**") && part.endsWith("**")) {
        // Remove the markers and make it bold
        const boldText = part.slice(2, -2);
        return <strong key={index}>{boldText}</strong>;
      }
      // Regular text
      return <React.Fragment key={index}>{part}</React.Fragment>;
    });
  };

  return (
    <>
      {paragraphs.map((paragraph, idx) => (
        <p key={idx} className={idx > 0 ? "mt-2" : ""}>
          {processBoldText(paragraph)}
        </p>
      ))}
    </>
  );
}
