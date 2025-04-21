import { useState, useEffect } from "react";
import { DragEndEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { StoryTemplate, PublicationStatus } from "@core/types";
import { Logger } from "@common/logger";
import { sendTrackedRequest, withRequestId } from "@common/requestUtils";
import {
  TemplatesResponse,
  UpdateTemplateRequest,
  TemplateResponse,
} from "@core/types/admin";

export const useTemplateCarouselManager = (token: string) => {
  const [templates, setTemplates] = useState<StoryTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Fetch published templates that are marked for welcome screen
  useEffect(() => {
    const fetchTemplates = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await sendTrackedRequest<TemplatesResponse>({
          path: `/admin/templates`,
          method: "GET",
          token,
        });

        // Filter for published templates marked for welcome screen
        const welcomeScreenTemplates = response.data.templates
          .filter(
            (template: StoryTemplate) =>
              template.publicationStatus === PublicationStatus.Published &&
              template.showOnWelcomeScreen
          )
          .map((template: StoryTemplate) => ({
            ...template,
            // Ensure all templates have an order value
            order:
              template.order !== undefined
                ? template.order
                : Number.MAX_SAFE_INTEGER,
          }))
          .sort((a: StoryTemplate, b: StoryTemplate) => a.order - b.order);

        Logger.Admin.log(
          `Loaded ${welcomeScreenTemplates.length} templates for carousel management, sorted by position`
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
          const request: UpdateTemplateRequest = withRequestId({
            id: template.id,
            template: {
              order: index,
            },
          });

          const response = await sendTrackedRequest<
            TemplateResponse,
            UpdateTemplateRequest
          >({
            path: `/admin/templates/${template.id}`,
            method: "PUT",
            token,
            body: request,
          });

          return response;
        }
        return { data: { template } };
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

  return {
    templates,
    isLoading,
    error,
    isSaving,
    handleDragEnd,
    saveOrder,
  };
};
