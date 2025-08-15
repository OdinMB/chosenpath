import React, { useState } from "react";
import { Icons } from "components/ui";
import { Stat } from "core/types";
import { ConfirmDialog } from "components/ui/ConfirmDialog";
import { ExpandableItem } from "components";
import { StatEditor } from "./StatEditor";

interface StatListItemProps {
  stat: Stat;
  type: "shared" | "player";
  index: number;
  onEdit: (statId: string) => void;
  onConvert: (type: "shared" | "player", index: number) => void;
  onDelete: (type: "shared" | "player", index: number) => void;
  readOnly?: boolean;
  statGroups?: string[];
}

export const StatListItem: React.FC<StatListItemProps> = ({
  stat,
  type,
  index,
  onEdit,
  onConvert,
  onDelete,
  readOnly = false,
  statGroups = [],
}) => {
  const [showConvertDialog, setShowConvertDialog] = useState(false);

  // Format value for display
  const formatValue = (value: number | string | string[]) => {
    if (value === undefined || value === null) return "";
    if (Array.isArray(value)) return value.join(", ");
    return value.toString();
  };

  // Generate description with group, type, and initial value
  const generateDescription = () => {
    const parts = [];

    if (stat.group) {
      parts.push(stat.group);
    }

    if (stat.type) {
      parts.push(stat.type.slice(0, 1).toUpperCase() + stat.type.slice(1));
    }

    if (
      (type === "shared" ||
        (type === "player" && stat.partOfPlayerBackgrounds === false)) &&
      stat.initialValue !== undefined
    ) {
      parts.push(`${formatValue(stat.initialValue)}`);
    }

    return parts.join(" - ");
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

  const actionIcons = !readOnly
    ? [
        {
          icon: <Icons.SwitchHorizontal className="h-5 w-5" />,
          onClick: handleConvertClick,
          title: `Convert to ${type === "shared" ? "player" : "shared"} stat`,
          className: "text-blue-500 hover:text-blue-700",
          ariaLabel: `Convert ${stat.name} to ${
            type === "shared" ? "player" : "shared"
          } stat`,
        },
      ]
    : [];

  const statTitle = (
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
      {type === "player" && stat.partOfPlayerBackgrounds === false && (
        <span className="ml-2 text-xs text-gray-500 italic">
          Not part of backgrounds
        </span>
      )}
    </div>
  );

  // Unlike PlayerBackgroundEditor which handles in-place editing with forms,
  // StatListItem delegates editing to a separate StatEditor component controlled by parent.
  // For read-only expanded mode, reuse StatEditor with readOnly=true to avoid duplicating UI logic.
  const renderEmptyForm = () =>
    readOnly ? (
      <StatEditor
        stat={stat}
        index={index}
        type={type}
        onUpdateStat={() => {}}
        onRemoveStat={() => {}}
        setEditingStats={() => new Set()}
        statGroups={statGroups || []}
        readOnly={true}
      />
    ) : (
      <div />
    );

  return (
    <>
      <ExpandableItem
        id={stat.id}
        title={statTitle}
        data={stat}
        editingSet={new Set()} // Always empty since we don't edit in-place
        setEditing={() => onEdit(stat.id)} // Tell parent to edit this stat
        onDelete={() => onDelete(type, index)}
        onSave={() => {}} // No-op since we don't handle saving here
        renderEditForm={renderEmptyForm}
        description={generateDescription()}
        readOnly={readOnly}
        actionIcons={actionIcons}
      />

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
