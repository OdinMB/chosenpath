import React from "react";
import { Icons } from "@components/ui/Icons";
import { Input } from "@components/ui/Input";
import { TextArea } from "@components/ui/TextArea";
import { PrimaryButton } from "@components/ui/PrimaryButton";
import { InfoIcon } from "@components/ui/InfoIcon";

interface GuidelinesTabProps {
  world: string;
  setWorld: (value: string) => void;
  rules: string[];
  tone: string[];
  conflicts: string[];
  decisions: string[];
  handleArrayFieldChange: (
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    index: number,
    value: string
  ) => void;
  handleAddArrayItem: (
    setter: React.Dispatch<React.SetStateAction<string[]>>
  ) => void;
  handleRemoveArrayItem: (
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    index: number
  ) => void;
  setRules: React.Dispatch<React.SetStateAction<string[]>>;
  setTone: React.Dispatch<React.SetStateAction<string[]>>;
  setConflicts: React.Dispatch<React.SetStateAction<string[]>>;
  setDecisions: React.Dispatch<React.SetStateAction<string[]>>;
}

export const GuidelinesTab: React.FC<GuidelinesTabProps> = ({
  world,
  setWorld,
  rules,
  tone,
  conflicts,
  decisions,
  handleArrayFieldChange,
  handleAddArrayItem,
  handleRemoveArrayItem,
  setRules,
  setTone,
  setConflicts,
  setDecisions,
}) => {
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

      {/* Rules section */}
      <div>
        <div className="flex justify-between items-center mb-1">
          <div className="flex items-center">
            <h3 className="font-semibold">Rules</h3>
            <InfoIcon
              tooltipText="Fundamental rules governing the story world"
              position="right"
              className="ml-2 mt-1"
            />
          </div>
          <PrimaryButton
            variant="outline"
            size="sm"
            onClick={() => handleAddArrayItem(setRules)}
            leftIcon={<Icons.Plus className="h-4 w-4" />}
          >
            Add
          </PrimaryButton>
        </div>
        {rules.length === 0 ? (
          <Input
            id="new-rule"
            name="new-rule"
            placeholder="Click + to add rules"
            disabled
          />
        ) : (
          rules.map((rule, index) => (
            <div key={index} className="flex gap-2 mb-2">
              <Input
                id={`rule-${index}`}
                name={`rule-${index}`}
                value={rule}
                onChange={(e) =>
                  handleArrayFieldChange(setRules, index, e.target.value)
                }
                placeholder="Add a rule"
              />
              <button
                type="button"
                onClick={() => handleRemoveArrayItem(setRules, index)}
                className="text-tertiary hover:text-tertiary-700"
                aria-label={`Remove rule ${index + 1}`}
              >
                <Icons.Trash className="h-4 w-4" />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Tone section */}
      <div>
        <div className="flex justify-between items-center mb-1">
          <div className="flex items-center">
            <h3 className="font-semibold">Tone</h3>
            <InfoIcon
              tooltipText="Emotional and narrative tone guidelines"
              position="right"
              className="ml-2 mt-1"
            />
          </div>
          <PrimaryButton
            variant="outline"
            size="sm"
            onClick={() => handleAddArrayItem(setTone)}
            leftIcon={<Icons.Plus className="h-4 w-4" />}
          >
            Add
          </PrimaryButton>
        </div>
        {tone.length === 0 ? (
          <Input
            id="new-tone"
            name="new-tone"
            placeholder="Click + to add tone guidelines"
            disabled
          />
        ) : (
          tone.map((toneItem, index) => (
            <div key={index} className="flex gap-2 mb-2">
              <Input
                id={`tone-${index}`}
                name={`tone-${index}`}
                value={toneItem}
                onChange={(e) =>
                  handleArrayFieldChange(setTone, index, e.target.value)
                }
                placeholder="Add a tone guideline"
              />
              <button
                type="button"
                onClick={() => handleRemoveArrayItem(setTone, index)}
                className="text-tertiary hover:text-tertiary-700"
                aria-label={`Remove tone guideline ${index + 1}`}
              >
                <Icons.Trash className="h-4 w-4" />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Conflicts section */}
      <div>
        <div className="flex justify-between items-center mb-1">
          <div className="flex items-center">
            <h3 className="font-semibold">Conflicts</h3>
            <InfoIcon
              tooltipText="Major conflicts driving the narrative"
              position="right"
              className="ml-2 mt-1"
            />
          </div>
          <PrimaryButton
            variant="outline"
            size="sm"
            onClick={() => handleAddArrayItem(setConflicts)}
            leftIcon={<Icons.Plus className="h-4 w-4" />}
          >
            Add
          </PrimaryButton>
        </div>
        {conflicts.length === 0 ? (
          <Input
            id="new-conflict"
            name="new-conflict"
            placeholder="Click + to add conflicts"
            disabled
          />
        ) : (
          conflicts.map((conflict, index) => (
            <div key={index} className="flex gap-2 mb-2">
              <Input
                id={`conflict-${index}`}
                name={`conflict-${index}`}
                value={conflict}
                onChange={(e) =>
                  handleArrayFieldChange(setConflicts, index, e.target.value)
                }
                placeholder="Add a conflict"
              />
              <button
                type="button"
                onClick={() => handleRemoveArrayItem(setConflicts, index)}
                className="text-tertiary hover:text-tertiary-700"
                aria-label={`Remove conflict ${index + 1}`}
              >
                <Icons.Trash className="h-4 w-4" />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Decisions section */}
      <div>
        <div className="flex justify-between items-center mb-1">
          <div className="flex items-center">
            <h3 className="font-semibold">Decisions</h3>
            <InfoIcon
              tooltipText="Major decisions in the narrative"
              position="right"
              className="ml-2 mt-1"
            />
          </div>
          <PrimaryButton
            variant="outline"
            size="sm"
            onClick={() => handleAddArrayItem(setDecisions)}
            leftIcon={<Icons.Plus className="h-4 w-4" />}
          >
            Add
          </PrimaryButton>
        </div>
        {decisions.length === 0 ? (
          <Input
            id="new-decision"
            name="new-decision"
            placeholder="Click + to add decisions"
            disabled
          />
        ) : (
          decisions.map((decision, index) => (
            <div key={index} className="flex gap-2 mb-2">
              <Input
                id={`decision-${index}`}
                name={`decision-${index}`}
                value={decision}
                onChange={(e) =>
                  handleArrayFieldChange(setDecisions, index, e.target.value)
                }
                placeholder="Add a decision"
              />
              <button
                type="button"
                onClick={() => handleRemoveArrayItem(setDecisions, index)}
                className="text-tertiary hover:text-tertiary-700"
                aria-label={`Remove decision ${index + 1}`}
              >
                <Icons.Trash className="h-4 w-4" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
