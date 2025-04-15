import React from "react";
import { ArrayField, TextArea, InfoIcon } from "@components/ui";
import { StoryTemplate } from "@core/types";
import { useTemplateGuidelines } from "../hooks/useTemplateGuidelines";

interface GuidelinesTabProps {
  template: StoryTemplate;
  onChange: (updates: Partial<StoryTemplate>) => void;
}

export const GuidelinesTab: React.FC<GuidelinesTabProps> = ({
  template,
  onChange,
}) => {
  const {
    world,
    rules,
    tone,
    conflicts,
    decisions,
    setWorld,
    setRules,
    setTone,
    setConflicts,
    setDecisions,
  } = useTemplateGuidelines({
    template,
    onChange,
  });

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-start gap-2">
          <span className="font-semibold pt-2">World</span>
          <InfoIcon
            tooltipText="Three sentences about the essence of the world"
            position="right"
            className="mt-3"
          />
          <TextArea
            id="world-description"
            name="world-description"
            value={world}
            onChange={(e) => setWorld(e.target.value)}
            className="flex-1"
            rows={3}
            placeholder="Describe the essence of the story world in three sentences"
          />
        </div>
      </div>

      <ArrayField
        title="Rules"
        tooltipText="Fundamental rules governing the story world"
        items={rules}
        onChange={setRules}
        placeholder="Add a rule"
        emptyPlaceholder="Click + to add rules"
      />

      <ArrayField
        title="Tone"
        tooltipText="Emotional and narrative tone guidelines"
        items={tone}
        onChange={setTone}
        placeholder="Add a tone guideline"
        emptyPlaceholder="Click + to add tone guidelines"
      />

      <ArrayField
        title="Conflicts"
        tooltipText="Major conflicts driving the narrative"
        items={conflicts}
        onChange={setConflicts}
        placeholder="Add a conflict"
        emptyPlaceholder="Click + to add conflicts"
      />

      <ArrayField
        title="Decisions"
        tooltipText="Major decisions in the narrative"
        items={decisions}
        onChange={setDecisions}
        placeholder="Add a decision"
        emptyPlaceholder="Click + to add decisions"
      />
    </div>
  );
};
