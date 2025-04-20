import React, { useState } from "react";
import { Checkbox, TextArea, PrimaryButton, Icons } from "@components/ui";
import { SectionData } from "@core/types";

interface AiIterationFormProps {
  onSubmit: (
    feedback: string,
    sections: Array<keyof SectionData>
  ) => Promise<void>;
  isLoading: boolean;
}

export const AiIterationForm: React.FC<AiIterationFormProps> = ({
  onSubmit,
  isLoading,
}) => {
  const [feedback, setFeedback] = useState("");
  const [selectedSections, setSelectedSections] = useState<
    Array<keyof SectionData>
  >([]);

  const handleSectionToggle = (section: keyof SectionData) => {
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
        <div className="bg-blue-50 border-l-4 border-blue-400 p-4 mb-2">
          <div className="flex items-start">
            <Icons.Info className="h-5 w-5 text-blue-400 mr-2 mt-0.5" />
            <div>
              <p className="text-sm text-blue-700 font-medium">
                Iterate with AI
              </p>
              <p className="text-sm text-blue-600">
                Let the AI help you improve specific sections of your story
                template. Select the sections you want to regenerate and provide
                feedback.
              </p>
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select sections to regenerate:
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
                Guidelines (world, rules, tone, conflicts, decisions, thread
                types)
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
                Story Elements (NPCs, locations, items, etc.)
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
                Stats (player and shared stats)
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
                Player Options (identities, backgrounds, individual outcomes)
              </label>
            </div>
          </div>
        </div>

        <div>
          <label
            htmlFor="feedback"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            Feedback or instructions for the AI:
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
