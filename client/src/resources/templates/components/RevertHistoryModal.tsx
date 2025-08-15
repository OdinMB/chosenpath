import React from "react";
import { Modal, PrimaryButton } from "components/ui";
import { formatRelativeTime } from "shared/utils/timeUtils";
import { StoryTemplate } from "core/types";

interface SaveHistoryEntry {
  template: StoryTemplate;
  timestamp: Date;
}

interface RevertHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  saveHistory: SaveHistoryEntry[];
  onRevert: (entry: SaveHistoryEntry) => void;
}

export const RevertHistoryModal: React.FC<RevertHistoryModalProps> = ({
  isOpen,
  onClose,
  saveHistory,
  onRevert,
}) => {
  const formatDate = (date: Date) => {
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Revert to Previous Save"
    >
      <div className="space-y-4">
        {saveHistory.length === 0 ? (
          <p className="text-gray-600 text-center py-8">
            No previous saves available
          </p>
        ) : (
          <>
            <p className="text-sm text-gray-600 mb-4">
              Select a previous save state to revert to. This will replace your
              current work.
            </p>
            <div className="space-y-2">
              {saveHistory.map((entry, index) => (
                <div
                  key={`${entry.timestamp.getTime()}-${index}`}
                  className="border border-gray-200 rounded-lg p-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="text-sm text-gray-700">
                        {formatRelativeTime(entry.timestamp.getTime())}
                      </div>
                      <div className="text-sm text-gray-500">
                        {formatDate(entry.timestamp)}
                      </div>
                    </div>
                    <PrimaryButton
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        onRevert(entry);
                        onClose();
                      }}
                    >
                      Revert
                    </PrimaryButton>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};
