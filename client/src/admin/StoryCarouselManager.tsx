import React, { useState, useEffect } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { SortableItem } from "./template/components/SortableItem";
import { StoryTemplate, PublicationStatus } from "@core/types";
import { PrimaryButton, InfoIcon } from "@components/ui";
import { config } from "@/config";
import { Logger } from "@common/logger";

interface StoryCarouselManagerProps {
  token: string;
}

export const StoryCarouselManager: React.FC<StoryCarouselManagerProps> = ({
  token,
}) => {
  const [templates, setTemplates] = useState<StoryTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Fetch published templates that are marked for welcome screen
  useEffect(() => {
    const fetchTemplates = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`${config.apiUrl}/admin/templates`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error(`Error fetching templates: ${response.status}`);
        }

        const data = await response.json();

        // Filter for published templates marked for welcome screen
        const welcomeScreenTemplates = data.templates
          .filter(
            (template: StoryTemplate) =>
              template.publicationStatus === PublicationStatus.Published &&
              template.showOnWelcomeScreen
          )
          .sort(
            (a: StoryTemplate, b: StoryTemplate) =>
              (a.order || Number.MAX_SAFE_INTEGER) -
              (b.order || Number.MAX_SAFE_INTEGER)
          );

        Logger.Admin.log(
          `Loaded ${welcomeScreenTemplates.length} templates for carousel management`
        );
        setTemplates(welcomeScreenTemplates);
      } catch (error) {
        Logger.Admin.error("Failed to load templates", error);
        setError("Failed to load story templates. Please try again.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchTemplates();
  }, [token]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setTemplates((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);

        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const saveOrder = async () => {
    setIsSaving(true);
    setError(null);

    try {
      // Update each template with its new order
      const updatePromises = templates.map(async (template, index) => {
        // Only update if order has changed
        if (template.order !== index) {
          const updatedTemplate = { ...template, order: index };

          const response = await fetch(
            `${config.apiUrl}/admin/templates/${template.id}`,
            {
              method: "PUT",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify(updatedTemplate),
            }
          );

          if (!response.ok) {
            throw new Error(
              `Failed to update template order: ${response.status}`
            );
          }

          return await response.json();
        }
        return { template };
      });

      await Promise.all(updatePromises);
      Logger.Admin.log("Successfully saved template order");

      // Update local state with new orders
      setTemplates(
        templates.map((template, index) => ({
          ...template,
          order: index,
        }))
      );
    } catch (error) {
      Logger.Admin.error("Failed to save template order", error);
      setError("Failed to save template order. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

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
