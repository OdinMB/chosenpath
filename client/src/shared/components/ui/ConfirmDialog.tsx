import React, { ReactNode } from "react";
import { PrimaryButton } from "./";
import { Modal } from "./Modal";

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
    <Modal isOpen={isOpen} onClose={onClose} title={title} width="md">
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
    </Modal>
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
