import React from "react";
import { Icons } from "../../../components/ui/Icons";

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
      <p className="text-sm text-gray-600 mb-4">
        Define the world, rules, tone, conflicts, and decisions that will shape
        the story.
      </p>

      <div>
        <label className="block text-sm font-medium text-primary mb-1">
          World (three sentences about the essence of the world)
        </label>
        <textarea
          value={world}
          onChange={(e) => setWorld(e.target.value)}
          className="w-full p-2 border border-gray-300 rounded-md"
          rows={3}
          placeholder="Describe the essence of the story world in three sentences"
        />
      </div>

      {/* Rules section */}
      <div>
        <div className="flex justify-between items-center mb-1">
          <label className="block text-sm font-medium text-primary">
            Rules (fundamental rules governing the story world)
          </label>
          <button
            type="button"
            onClick={() => handleAddArrayItem(setRules)}
            className="text-secondary hover:text-secondary-700"
          >
            <Icons.Plus className="h-4 w-4" />
          </button>
        </div>
        {rules.map((rule, index) => (
          <div key={index} className="flex gap-2 mb-2">
            <input
              value={rule}
              onChange={(e) =>
                handleArrayFieldChange(setRules, index, e.target.value)
              }
              className="flex-grow p-2 border border-gray-300 rounded-md"
              placeholder="Add a rule"
            />
            <button
              type="button"
              onClick={() => handleRemoveArrayItem(setRules, index)}
              className="text-tertiary hover:text-tertiary-700"
            >
              <Icons.Trash className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      {/* Tone section */}
      <div>
        <div className="flex justify-between items-center mb-1">
          <label className="block text-sm font-medium text-primary">
            Tone (emotional and narrative tone guidelines)
          </label>
          <button
            type="button"
            onClick={() => handleAddArrayItem(setTone)}
            className="text-secondary hover:text-secondary-700"
          >
            <Icons.Plus className="h-4 w-4" />
          </button>
        </div>
        {tone.map((toneItem, index) => (
          <div key={index} className="flex gap-2 mb-2">
            <input
              value={toneItem}
              onChange={(e) =>
                handleArrayFieldChange(setTone, index, e.target.value)
              }
              className="flex-grow p-2 border border-gray-300 rounded-md"
              placeholder="Add a tone guideline"
            />
            <button
              type="button"
              onClick={() => handleRemoveArrayItem(setTone, index)}
              className="text-tertiary hover:text-tertiary-700"
            >
              <Icons.Trash className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      {/* Conflicts section */}
      <div>
        <div className="flex justify-between items-center mb-1">
          <label className="block text-sm font-medium text-primary">
            Conflicts (major conflicts driving the narrative)
          </label>
          <button
            type="button"
            onClick={() => handleAddArrayItem(setConflicts)}
            className="text-secondary hover:text-secondary-700"
          >
            <Icons.Plus className="h-4 w-4" />
          </button>
        </div>
        {conflicts.map((conflict, index) => (
          <div key={index} className="flex gap-2 mb-2">
            <input
              value={conflict}
              onChange={(e) =>
                handleArrayFieldChange(setConflicts, index, e.target.value)
              }
              className="flex-grow p-2 border border-gray-300 rounded-md"
              placeholder="Add a conflict"
            />
            <button
              type="button"
              onClick={() => handleRemoveArrayItem(setConflicts, index)}
              className="text-tertiary hover:text-tertiary-700"
            >
              <Icons.Trash className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      {/* Decisions section */}
      <div>
        <div className="flex justify-between items-center mb-1">
          <label className="block text-sm font-medium text-primary">
            Decisions (types of decisions players will make)
          </label>
          <button
            type="button"
            onClick={() => handleAddArrayItem(setDecisions)}
            className="text-secondary hover:text-secondary-700"
          >
            <Icons.Plus className="h-4 w-4" />
          </button>
        </div>
        {decisions.map((decision, index) => (
          <div key={index} className="flex gap-2 mb-2">
            <input
              value={decision}
              onChange={(e) =>
                handleArrayFieldChange(setDecisions, index, e.target.value)
              }
              className="flex-grow p-2 border border-gray-300 rounded-md"
              placeholder="Add a decision type"
            />
            <button
              type="button"
              onClick={() => handleRemoveArrayItem(setDecisions, index)}
              className="text-tertiary hover:text-tertiary-700"
            >
              <Icons.Trash className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
