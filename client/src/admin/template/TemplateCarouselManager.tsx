import React from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { SortableItem } from "./components/SortableItem.js";
import { PrimaryButton, InfoIcon } from "components/ui";
import { useTemplateCarouselManager } from "./hooks/useTemplateCarouselManager.js";

export const TemplateCarouselManager: React.FC = () => {
  const { templates, isLoading, error, isSaving, handleDragEnd, saveOrder } =
    useTemplateCarouselManager();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="w-8 h-8 border-t-2 border-b-2 border-secondary rounded-full animate-spin"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <div className="text-red-500 mb-4">{error}</div>
        <PrimaryButton onClick={() => window.location.reload()}>
          Retry
        </PrimaryButton>
      </div>
    );
  }

  if (templates.length === 0) {
    return "";
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center">
          <h2 className="text-xl font-semibold mr-2">Welcome Screen Stories</h2>
          <InfoIcon
            tooltipText="Drag and drop to reorder templates shown on the welcome screen"
            position="right"
            className="mt-1"
          />
        </div>
        <PrimaryButton
          onClick={saveOrder}
          isLoading={isSaving}
          disabled={isSaving}
        >
          Save Order
        </PrimaryButton>
      </div>

      {/* @ts-expect-error - DndContext has React 18 compatibility issues, but it works fine */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={templates.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2">
            {templates.map((template) => (
              <SortableItem
                key={template.id}
                id={template.id}
                template={template}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
};
