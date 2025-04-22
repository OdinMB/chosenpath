import React, { useState } from "react";
import { Icons } from "components/ui";
import { Stat } from "core/types";
import { ConfirmDialog } from "components/ui/ConfirmDialog";

interface StatListItemProps {
  stat: Stat;
  type: "shared" | "player";
  index: number;
  onEdit: (statId: string) => void;
  onConvert: (type: "shared" | "player", index: number) => void;
  onDelete: (type: "shared" | "player", index: number) => void;
  readOnly?: boolean;
}

export const StatListItem: React.FC<StatListItemProps> = ({
  stat,
  type,
  index,
  onEdit,
  onConvert,
  onDelete,
  readOnly = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showConvertDialog, setShowConvertDialog] = useState(false);

  const handleToggleExpand = () => {
    if (!isExpanded) {
      onEdit(stat.id);
    }
    setIsExpanded(!isExpanded);
  };

  const handleConvertClick = () => {
    setShowConvertDialog(true);
  };

  const handleConfirmConvert = () => {
    onConvert(type, index);
    setShowConvertDialog(false);
  };

  // Dialog messages based on the conversion direction
  const convertDialogTitle = `Convert ${stat.name} to ${
    type === "shared" ? "Player" : "Shared"
  } Stat`;

  const convertDialogMessage =
    type === "shared"
      ? "Converting this shared stat to a player stat means you'll need to define initial values for each character background in the Players tab. Do you want to continue?"
      : "Converting this player stat to a shared stat will delete this stat from all character backgrounds. This cannot be undone. Do you want to continue?";

  return (
    <>
      <div className="bg-white p-4 rounded-lg shadow mb-4 flex justify-between items-center">
        <div className="flex items-center">
          <span
            className={`w-2 h-2 rounded-full mr-2 ${
              type === "shared" ? "bg-blue-500" : "bg-green-500"
            }`}
            title={
              type === "shared"
                ? "Shared stat (applies to all players)"
                : "Player stat (unique to each player)"
            }
          ></span>
          <span className="font-medium">{stat.name}</span>
        </div>
        <div className="flex gap-2">
          {!readOnly && (
            <>
              <button
                onClick={() => onEdit(stat.id)}
                className="text-secondary hover:text-secondary-700"
                aria-label={`Edit ${stat.name}`}
              >
                <Icons.Edit className="h-5 w-5" />
              </button>
              <button
                onClick={handleConvertClick}
                className="text-blue-500 hover:text-blue-700"
                aria-label={`Convert ${stat.name} to ${
                  type === "shared" ? "player" : "shared"
                } stat`}
                title={`Convert to ${
                  type === "shared" ? "player" : "shared"
                } stat`}
              >
                <Icons.SwitchHorizontal className="h-5 w-5" />
              </button>
              <button
                onClick={() => onDelete(type, index)}
                className="text-tertiary hover:text-tertiary-700"
                aria-label={`Remove ${stat.name}`}
              >
                <Icons.Trash className="h-5 w-5" />
              </button>
            </>
          )}
          {readOnly && (
            <button
              onClick={handleToggleExpand}
              className="text-secondary hover:text-secondary-700"
              aria-label={
                isExpanded ? `Collapse ${stat.name}` : `View ${stat.name}`
              }
              title={isExpanded ? "Collapse details" : "View details"}
            >
              {isExpanded ? (
                <Icons.ChevronUp className="h-5 w-5" />
              ) : (
                <Icons.ChevronDown className="h-5 w-5" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Confirm Dialog for stat conversion */}
      <ConfirmDialog
        isOpen={showConvertDialog}
        onClose={() => setShowConvertDialog(false)}
        onConfirm={handleConfirmConvert}
        title={convertDialogTitle}
        message={convertDialogMessage}
        confirmText="Convert"
        cancelText="Cancel"
      />
    </>
  );
};
