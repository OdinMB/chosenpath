import React from "react";
import { Icons } from "@components/ui";
import { Stat } from "@core/types";

interface StatListItemProps {
  stat: Stat;
  type: "shared" | "player";
  index: number;
  onEdit: (statId: string) => void;
  onConvert: (type: "shared" | "player", index: number) => void;
  onDelete: (type: "shared" | "player", index: number) => void;
}

export const StatListItem: React.FC<StatListItemProps> = ({
  stat,
  type,
  index,
  onEdit,
  onConvert,
  onDelete,
}) => {
  return (
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
        <button
          onClick={() => onEdit(stat.id)}
          className="text-secondary hover:text-secondary-700"
          aria-label={`Edit ${stat.name}`}
        >
          <Icons.Edit className="h-5 w-5" />
        </button>
        <button
          onClick={() => onConvert(type, index)}
          className="text-blue-500 hover:text-blue-700"
          aria-label={`Convert ${stat.name} to ${
            type === "shared" ? "player" : "shared"
          } stat`}
          title={`Convert to ${type === "shared" ? "player" : "shared"} stat`}
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
      </div>
    </div>
  );
};
