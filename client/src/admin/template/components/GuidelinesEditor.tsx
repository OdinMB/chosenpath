import React from "react";
import { TextArea, InfoIcon } from "@components/ui";
import { ArrayField } from "@components";
import { StoryTemplate } from "@core/types";
import { useGuidelinesEditor } from "../hooks/useGuidelinesEditor";

interface GuidelinesEditorProps {
  template: StoryTemplate;
  onChange?: (updates: Partial<StoryTemplate>) => void;
  readOnly?: boolean;
}

export const GuidelinesEditor: React.FC<GuidelinesEditorProps> = ({
  template,
  onChange,
  readOnly = false,
}) => {
  const {
    world,
    rules,
    tone,
    conflicts,
    decisions,
    typesOfThreads,
    setWorld,
    setRules,
    setTone,
    setConflicts,
    setDecisions,
    setTypesOfThreads,
  } = useGuidelinesEditor({
    template,
    onChange,
    readOnly,
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
            disabled={readOnly}
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
        readOnly={readOnly}
      />

      <ArrayField
        title="Tone"
        tooltipText="Emotional and narrative tone guidelines"
        items={tone}
        onChange={setTone}
        placeholder="Add a tone guideline"
        emptyPlaceholder="Click + to add tone guidelines"
        readOnly={readOnly}
      />

      <ArrayField
        title="Conflicts"
        tooltipText="Major conflicts driving the narrative"
        items={conflicts}
        onChange={setConflicts}
        placeholder="Add a conflict"
        emptyPlaceholder="Click + to add conflicts"
        readOnly={readOnly}
      />

      <ArrayField
        title="Decisions"
        tooltipText="Major decisions in the narrative"
        items={decisions}
        onChange={setDecisions}
        placeholder="Add a decision"
        emptyPlaceholder="Click + to add decisions"
        readOnly={readOnly}
      />

      <ArrayField
        title="Types of Threads"
        tooltipText="Suggested types of threads for the story (e.g. witness interview, car chase, romantic date)"
        items={typesOfThreads}
        onChange={setTypesOfThreads}
        placeholder="Add a thread type"
        emptyPlaceholder="Click + to add thread types"
        readOnly={readOnly}
      />
    </div>
  );
};
