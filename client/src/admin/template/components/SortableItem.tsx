import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { StoryTemplate } from "core/types";
import { Icons } from "components/ui";

interface SortableItemProps {
  id: string;
  template: StoryTemplate;
}

export const SortableItem: React.FC<SortableItemProps> = ({ id, template }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`flex items-center p-4 bg-white border rounded-lg shadow-sm cursor-grab ${
        isDragging ? "opacity-50" : ""
      }`}
    >
      <div className="flex-1">
        <h3 className="font-medium">{template.title}</h3>
        <p className="text-sm text-gray-500 line-clamp-1">{template.teaser}</p>
      </div>

      <div className="text-sm text-gray-400 mr-2">
        Position: {template.order !== undefined ? template.order + 1 : "—"}
      </div>

      <div className="flex items-center justify-center ml-3 text-gray-400">
        <Icons.GripVertical className="h-5 w-5" />
      </div>
    </div>
  );
};
