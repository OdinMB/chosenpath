import { PrimaryButton } from "./";

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
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
      <div className="relative bg-white rounded-lg p-6 max-w-sm w-full mx-4 shadow-xl">
        <h3 className="text-lg font-semibold text-primary mb-2">{title}</h3>
        <p className="text-primary-800 mb-6">{message}</p>

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
