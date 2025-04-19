import { useState } from "react";
import { StoryTemplate } from "@core/types";

interface UseTemplateGuidelinesProps {
  template: StoryTemplate;
  onChange?: (updates: Partial<StoryTemplate>) => void;
  readOnly?: boolean;
}

export function useTemplateGuidelines({
  template,
  onChange,
  readOnly = false,
}: UseTemplateGuidelinesProps) {
  const [world, setWorldState] = useState<string>(
    template.guidelines?.world || ""
  );
  const [rules, setRulesState] = useState<string[]>(
    template.guidelines?.rules || []
  );
  const [tone, setToneState] = useState<string[]>(
    template.guidelines?.tone || []
  );
  const [conflicts, setConflictsState] = useState<string[]>(
    template.guidelines?.conflicts || []
  );
  const [decisions, setDecisionsState] = useState<string[]>(
    template.guidelines?.decisions || []
  );
  const [typesOfThreads, setTypesOfThreadsState] = useState<string[]>(
    template.guidelines?.typesOfThreads || []
  );

  // Generic function to update guidelines with changes to a specific field
  const updateGuidelineField = <T>(
    field: keyof typeof template.guidelines,
    value: T
  ) => {
    if (readOnly || !onChange) return;

    onChange({
      guidelines: {
        ...template.guidelines,
        world,
        rules,
        tone,
        conflicts,
        decisions,
        typesOfThreads,
        [field]: value,
      },
    });
  };

  // Create wrapper setters that update parent state
  const setWorld = (newWorld: string) => {
    if (readOnly) return;

    setWorldState(newWorld);
    updateGuidelineField("world", newWorld);
  };

  const setRules = (newRules: string[]) => {
    if (readOnly) return;

    setRulesState(newRules);
    updateGuidelineField("rules", newRules);
  };

  const setTone = (newTone: string[]) => {
    if (readOnly) return;

    setToneState(newTone);
    updateGuidelineField("tone", newTone);
  };

  const setConflicts = (newConflicts: string[]) => {
    if (readOnly) return;

    setConflictsState(newConflicts);
    updateGuidelineField("conflicts", newConflicts);
  };

  const setDecisions = (newDecisions: string[]) => {
    if (readOnly) return;

    setDecisionsState(newDecisions);
    updateGuidelineField("decisions", newDecisions);
  };

  const setTypesOfThreads = (newTypesOfThreads: string[]) => {
    if (readOnly) return;

    setTypesOfThreadsState(newTypesOfThreads);
    updateGuidelineField("typesOfThreads", newTypesOfThreads);
  };

  // Update all guidelines at once
  const updateGuidelines = () => {
    if (readOnly || !onChange) return;

    onChange({
      guidelines: {
        ...template.guidelines,
        world,
        rules,
        tone,
        conflicts,
        decisions,
        typesOfThreads,
      },
    });
  };

  // Helper functions for array fields
  const handleArrayFieldChange = (
    setter: (value: string[]) => void,
    currentValues: string[],
    index: number,
    value: string
  ) => {
    if (readOnly) return;

    const updated = [...currentValues];
    updated[index] = value;
    setter(updated);
  };

  const handleAddArrayItem = (
    setter: (value: string[]) => void,
    currentValues: string[]
  ) => {
    if (readOnly) return;

    setter([...currentValues, ""]);
  };

  const handleRemoveArrayItem = (
    setter: (value: string[]) => void,
    currentValues: string[],
    index: number
  ) => {
    if (readOnly) return;

    setter(currentValues.filter((_, i) => i !== index));
  };

  // Interface adapters for components that expect React.Dispatch<React.SetStateAction<string[]>>
  const handleArrayFieldChangeAdapter = (
    setter: (values: string[]) => void,
    index: number,
    value: string
  ) => {
    if (readOnly) return;

    if (setter === setRules) {
      handleArrayFieldChange(setRules, rules, index, value);
    } else if (setter === setTone) {
      handleArrayFieldChange(setTone, tone, index, value);
    } else if (setter === setConflicts) {
      handleArrayFieldChange(setConflicts, conflicts, index, value);
    } else if (setter === setDecisions) {
      handleArrayFieldChange(setDecisions, decisions, index, value);
    } else if (setter === setTypesOfThreads) {
      handleArrayFieldChange(setTypesOfThreads, typesOfThreads, index, value);
    }
  };

  const handleAddArrayItemAdapter = (setter: (values: string[]) => void) => {
    if (readOnly) return;

    if (setter === setRules) {
      handleAddArrayItem(setRules, rules);
    } else if (setter === setTone) {
      handleAddArrayItem(setTone, tone);
    } else if (setter === setConflicts) {
      handleAddArrayItem(setConflicts, conflicts);
    } else if (setter === setDecisions) {
      handleAddArrayItem(setDecisions, decisions);
    } else if (setter === setTypesOfThreads) {
      handleAddArrayItem(setTypesOfThreads, typesOfThreads);
    }
  };

  const handleRemoveArrayItemAdapter = (
    setter: (values: string[]) => void,
    index: number
  ) => {
    if (readOnly) return;

    if (setter === setRules) {
      handleRemoveArrayItem(setRules, rules, index);
    } else if (setter === setTone) {
      handleRemoveArrayItem(setTone, tone, index);
    } else if (setter === setConflicts) {
      handleRemoveArrayItem(setConflicts, conflicts, index);
    } else if (setter === setDecisions) {
      handleRemoveArrayItem(setDecisions, decisions, index);
    } else if (setter === setTypesOfThreads) {
      handleRemoveArrayItem(setTypesOfThreads, typesOfThreads, index);
    }
  };

  return {
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
    handleArrayFieldChange: handleArrayFieldChangeAdapter,
    handleAddArrayItem: handleAddArrayItemAdapter,
    handleRemoveArrayItem: handleRemoveArrayItemAdapter,
    updateGuidelines,
  };
}
