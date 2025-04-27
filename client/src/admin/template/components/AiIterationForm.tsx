import React, { useState, useEffect } from "react";
import { Checkbox, TextArea, PrimaryButton, Icons } from "components/ui";
import { TemplateIterationSections } from "core/types";

interface AiIterationFormProps {
  onSubmit: (
    feedback: string,
    sections: TemplateIterationSections[]
  ) => Promise<void>;
  isLoading: boolean;
  templateId?: string; // Optional templateId for persisting state per template
}

// Storage key for persisting form state
const STORAGE_PREFIX = "template_iteration_form";

export const AiIterationForm: React.FC<AiIterationFormProps> = ({
  onSubmit,
  isLoading,
  templateId,
}) => {
  // Generate a storage key specific to this template if available
  const storageKey = templateId
    ? `${STORAGE_PREFIX}_${templateId}`
    : STORAGE_PREFIX;

  // Initialize state from localStorage or defaults
  const [feedback, setFeedback] = useState(() => {
    const saved = localStorage.getItem(`${storageKey}_feedback`);
    return saved || "";
  });

  const [selectedSections, setSelectedSections] = useState<
    TemplateIterationSections[]
  >(() => {
    const saved = localStorage.getItem(`${storageKey}_sections`);
    return saved ? JSON.parse(saved) : [];
  });

  // Update localStorage when form values change
  useEffect(() => {
    localStorage.setItem(`${storageKey}_feedback`, feedback);
  }, [feedback, storageKey]);

  useEffect(() => {
    localStorage.setItem(
      `${storageKey}_sections`,
      JSON.stringify(selectedSections)
    );
  }, [selectedSections, storageKey]);

  const handleSectionToggle = (section: TemplateIterationSections) => {
    setSelectedSections((prev) => {
      if (prev.includes(section)) {
        return prev.filter((s) => s !== section);
      } else {
        return [...prev, section];
      }
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (selectedSections.length === 0) {
      return; // Nothing to iterate
    }

    try {
      await onSubmit(feedback, selectedSections);
    } catch (error) {
      console.error("Error submitting AI iteration request:", error);
    }
  };

  return (
    <div className="bg-white p-4 rounded-lg border border-primary-100 shadow-md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block font-semibold text-gray-700 mb-2">
            Sections to regenerate
          </label>
          <div className="space-y-2">
            <div className="flex items-center">
              <Checkbox
                id="guidelines-section"
                checked={selectedSections.includes("guidelines")}
                onChange={() => handleSectionToggle("guidelines")}
              />
              <label
                htmlFor="guidelines-section"
                className="ml-2 text-sm text-gray-700"
              >
                Guidelines
              </label>
            </div>
            <div className="flex items-center">
              <Checkbox
                id="storyElements-section"
                checked={selectedSections.includes("storyElements")}
                onChange={() => handleSectionToggle("storyElements")}
              />
              <label
                htmlFor="storyElements-section"
                className="ml-2 text-sm text-gray-700"
              >
                Story Elements
              </label>
            </div>
            <div className="flex items-center">
              <Checkbox
                id="sharedOutcomes-section"
                checked={selectedSections.includes("sharedOutcomes")}
                onChange={() => handleSectionToggle("sharedOutcomes")}
              />
              <label
                htmlFor="sharedOutcomes-section"
                className="ml-2 text-sm text-gray-700"
              >
                Shared Outcomes
              </label>
            </div>
            <div className="flex items-center">
              <Checkbox
                id="stats-section"
                checked={selectedSections.includes("stats")}
                onChange={() => handleSectionToggle("stats")}
              />
              <label
                htmlFor="stats-section"
                className="ml-2 text-sm text-gray-700"
              >
                Stats
              </label>
            </div>
            <div className="flex items-center">
              <Checkbox
                id="players-section"
                checked={selectedSections.includes("players")}
                onChange={() => handleSectionToggle("players")}
              />
              <label
                htmlFor="players-section"
                className="ml-2 text-sm text-gray-700"
              >
                Players
              </label>
            </div>
            <div className="flex items-center">
              <Checkbox
                id="media-section"
                checked={selectedSections.includes("media")}
                onChange={() => handleSectionToggle("media")}
              />
              <label
                htmlFor="media-section"
                className="ml-2 text-sm text-gray-700"
              >
                Media
              </label>
            </div>
          </div>
        </div>

        <div>
          <label
            htmlFor="feedback"
            className="block font-semibold text-gray-700 mb-2"
          >
            Feedback or instructions for the AI
          </label>
          <TextArea
            id="feedback"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Describe what you'd like to change or improve in the selected sections..."
            rows={5}
          />
        </div>

        <div className="pt-2">
          <PrimaryButton
            type="submit"
            disabled={isLoading || selectedSections.length === 0}
            isLoading={isLoading}
            leftIcon={<Icons.Plus className="h-4 w-4" />}
          >
            Generate AI Iteration
          </PrimaryButton>
        </div>
      </form>
    </div>
  );
};
