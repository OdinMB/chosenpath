import { useState, useEffect, useCallback } from "react";
import { StoryTemplate, TemplateListItem } from "shared/types/storyTemplate";
import { PrimaryButton } from "./ui/PrimaryButton";
import { Icons } from "./ui/Icons";
import { config } from "../config";
import { Logger } from "../utils/logger";

interface TemplateSelectorProps {
  onSelect: (template: StoryTemplate) => void;
  onCancel: () => void;
}

export function TemplateSelector({
  onSelect,
  onCancel,
}: TemplateSelectorProps) {
  const [templates, setTemplates] = useState<TemplateListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const loadTemplates = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${config.apiUrl}/library/templates`);

      if (!response.ok) {
        throw new Error("Failed to load story templates");
      }

      const data = await response.json();
      Logger.Story.log(`Loaded ${data.templates.length} story templates`);
      setTemplates(data.templates);
    } catch (error) {
      Logger.Story.error("Failed to load story templates", error);
      setError("Failed to load story templates. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const handleSelectTemplate = async (templateId: string) => {
    if (selectedId === templateId) {
      setSelectedId(null);
      return;
    }

    setSelectedId(templateId);
  };

  const handleUseTemplate = async () => {
    if (!selectedId) return;

    try {
      setIsLoading(true);
      const response = await fetch(
        `${config.apiUrl}/library/templates/${selectedId}`
      );

      if (!response.ok) {
        throw new Error("Failed to load template details");
      }

      const { template } = await response.json();
      onSelect(template);
    } catch (error) {
      Logger.Story.error("Failed to load template details", error);
      setError("Failed to load template details. Please try again.");
      setIsLoading(false);
    }
  };

  const formatGameMode = (mode: string) => {
    return mode.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  };

  return (
    <div className="p-4 bg-white rounded-lg border border-primary-100 shadow-md space-y-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold text-primary">Story Templates</h2>
        <PrimaryButton
          variant="outline"
          size="sm"
          onClick={onCancel}
          leftIcon={<Icons.ArrowLeft className="h-4 w-4" />}
        >
          Back
        </PrimaryButton>
      </div>

      {error && (
        <div className="p-4 rounded-md bg-tertiary-100 text-tertiary text-sm mb-4">
          <div className="flex items-center">
            <Icons.Error className="w-5 h-5 mr-2" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-t-2 border-b-2 border-secondary rounded-full animate-spin"></div>
        </div>
      ) : templates.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-gray-500">No story templates found.</p>
          <p className="text-sm text-gray-400 mt-2">
            Templates can be created in the admin section.
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-3 mb-4">
            {templates.map((template) => (
              <div
                key={template.id}
                onClick={() => handleSelectTemplate(template.id)}
                className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                  selectedId === template.id
                    ? "border-secondary bg-secondary-50"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <h3 className="font-medium text-lg">{template.title}</h3>
                <div className="flex flex-wrap gap-2 mt-2">
                  <span className="px-2 py-1 bg-primary-50 text-primary-700 rounded text-xs">
                    {template.playerCount} Player
                    {template.playerCount > 1 ? "s" : ""}
                  </span>
                  <span className="px-2 py-1 bg-primary-50 text-primary-700 rounded text-xs">
                    {formatGameMode(template.gameMode)}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end">
            <PrimaryButton
              onClick={handleUseTemplate}
              disabled={!selectedId || isLoading}
              isLoading={isLoading}
            >
              Use Template
            </PrimaryButton>
          </div>
        </>
      )}
    </div>
  );
}
