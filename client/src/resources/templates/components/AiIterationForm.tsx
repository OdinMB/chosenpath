import React, { useState, useEffect } from "react";
import { Checkbox, TextArea, PrimaryButton, Icons } from "components/ui";
import { ImageCard } from "shared/components/ImageCard";
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

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia === "undefined"
    ) {
      return;
    }
    const mq = window.matchMedia("(max-width: 640px)");
    const update = () => setIsMobile(mq.matches);
    update();
    if (mq.addEventListener) {
      mq.addEventListener("change", update);
      return () => mq.removeEventListener("change", update);
    }
    mq.addListener(update);
    return () => mq.removeListener(update);
  }, []);

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

  const sections: Array<{ id: TemplateIterationSections; label: string }> = [
    { id: "difficultyLevels", label: "Difficulty Levels" },
    { id: "media", label: "Media" },
    { id: "guidelines", label: "Guidelines" },
    { id: "storyElements", label: "Story Elements" },
    { id: "stats", label: "Stats" },
    { id: "sharedOutcomes", label: "Shared Outcomes" },
    { id: "players", label: "Players (and individual Outcomes)" },
  ];

  const CheckboxRow = ({
    id,
    label,
  }: {
    id: TemplateIterationSections;
    label: string;
  }) => (
    <div className="flex items-center">
      <Checkbox
        id={`${id}-section`}
        checked={selectedSections.includes(id)}
        onChange={() => handleSectionToggle(id)}
      />
      <label htmlFor={`${id}-section`} className="ml-2 text-sm text-gray-700">
        {label}
      </label>
    </div>
  );

  const form = (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block font-semibold text-gray-700 mb-2">
          Sections to adjust
        </label>
        {isMobile ? (
          <div className="space-y-2">
            {sections.map((s) => (
              <CheckboxRow key={s.id} id={s.id} label={s.label} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              {sections.slice(0, 3).map((s) => (
                <CheckboxRow key={s.id} id={s.id} label={s.label} />
              ))}
            </div>
            <div className="space-y-2">
              {sections.slice(3).map((s) => (
                <CheckboxRow key={s.id} id={s.id} label={s.label} />
              ))}
            </div>
          </div>
        )}
      </div>

      <div>
        <label
          htmlFor="feedback"
          className="block font-semibold text-gray-700 mb-2"
        >
          Feedback and instructions
        </label>
        <TextArea
          id="feedback"
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder="Describe what you'd like to add or improve in the selected sections..."
          autoHeight
        />
      </div>

      <div className="pt-2">
        <PrimaryButton
          type="submit"
          disabled={isLoading || selectedSections.length === 0}
          isLoading={isLoading}
          leftIcon={<Icons.Wand className="h-4 w-4" />}
        >
          Adjust My World
        </PrimaryButton>
      </div>
    </form>
  );

  return isMobile ? (
    form
  ) : (
    <ImageCard
      publicImagePath="/wand.jpeg"
      title="AI Worldbuilding Assistant"
      className="max-w-2xl mx-auto"
    >
      <div className="flex flex-col h-full">{form}</div>
    </ImageCard>
  );
};
