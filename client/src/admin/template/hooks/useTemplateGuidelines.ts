import { useState, useEffect, useRef } from "react";
import { StoryTemplate, Guidelines } from "@core/types";

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
  // Single state object to manage all guidelines
  const [state, setState] = useState<Guidelines>({
    world: template.guidelines?.world || "",
    rules: template.guidelines?.rules || [],
    tone: template.guidelines?.tone || [],
    conflicts: template.guidelines?.conflicts || [],
    decisions: template.guidelines?.decisions || [],
    typesOfThreads: template.guidelines?.typesOfThreads || [],
  });

  // Track template ID to detect template changes
  const previousTemplateId = useRef(template.id);

  // Update state when template changes
  useEffect(() => {
    if (previousTemplateId.current !== template.id) {
      setState({
        world: template.guidelines?.world || "",
        rules: template.guidelines?.rules || [],
        tone: template.guidelines?.tone || [],
        conflicts: template.guidelines?.conflicts || [],
        decisions: template.guidelines?.decisions || [],
        typesOfThreads: template.guidelines?.typesOfThreads || [],
      });
      previousTemplateId.current = template.id;
    }
  }, [
    template.id,
    template.guidelines?.world,
    template.guidelines?.rules,
    template.guidelines?.tone,
    template.guidelines?.conflicts,
    template.guidelines?.decisions,
    template.guidelines?.typesOfThreads,
  ]);

  // Helper to update state and notify parent
  const updateField = <K extends keyof Guidelines>(
    field: K,
    value: Guidelines[K]
  ) => {
    if (readOnly) return;

    // Update our state
    setState((current) => {
      const newState = { ...current, [field]: value };

      // Notify parent of change - use setTimeout to avoid update during render
      if (onChange) {
        setTimeout(() => {
          onChange({
            guidelines: newState,
          });
        }, 0);
      }

      return newState;
    });
  };

  // Individual field setters
  const setWorld = (value: string) => updateField("world", value);
  const setRules = (value: string[]) => updateField("rules", value);
  const setTone = (value: string[]) => updateField("tone", value);
  const setConflicts = (value: string[]) => updateField("conflicts", value);
  const setDecisions = (value: string[]) => updateField("decisions", value);
  const setTypesOfThreads = (value: string[]) =>
    updateField("typesOfThreads", value);

  // Field adapter for ArrayField component
  const handleArrayFieldChange = (
    setter: (values: string[]) => void,
    index: number,
    value: string
  ) => {
    if (readOnly) return;

    if (setter === setRules) {
      const updatedArray = [...state.rules];
      updatedArray[index] = value;
      setRules(updatedArray);
    } else if (setter === setTone) {
      const updatedArray = [...state.tone];
      updatedArray[index] = value;
      setTone(updatedArray);
    } else if (setter === setConflicts) {
      const updatedArray = [...state.conflicts];
      updatedArray[index] = value;
      setConflicts(updatedArray);
    } else if (setter === setDecisions) {
      const updatedArray = [...state.decisions];
      updatedArray[index] = value;
      setDecisions(updatedArray);
    } else if (setter === setTypesOfThreads) {
      const updatedArray = [...state.typesOfThreads];
      updatedArray[index] = value;
      setTypesOfThreads(updatedArray);
    }
  };

  const handleAddArrayItem = (setter: (values: string[]) => void) => {
    if (readOnly) return;

    if (setter === setRules) {
      setRules([...state.rules, ""]);
    } else if (setter === setTone) {
      setTone([...state.tone, ""]);
    } else if (setter === setConflicts) {
      setConflicts([...state.conflicts, ""]);
    } else if (setter === setDecisions) {
      setDecisions([...state.decisions, ""]);
    } else if (setter === setTypesOfThreads) {
      setTypesOfThreads([...state.typesOfThreads, ""]);
    }
  };

  const handleRemoveArrayItem = (
    setter: (values: string[]) => void,
    index: number
  ) => {
    if (readOnly) return;

    if (setter === setRules) {
      setRules(state.rules.filter((_, i) => i !== index));
    } else if (setter === setTone) {
      setTone(state.tone.filter((_, i) => i !== index));
    } else if (setter === setConflicts) {
      setConflicts(state.conflicts.filter((_, i) => i !== index));
    } else if (setter === setDecisions) {
      setDecisions(state.decisions.filter((_, i) => i !== index));
    } else if (setter === setTypesOfThreads) {
      setTypesOfThreads(state.typesOfThreads.filter((_, i) => i !== index));
    }
  };

  // Update all guidelines at once (for form submission)
  const updateGuidelines = () => {
    if (readOnly || !onChange) return;

    onChange({
      guidelines: state,
    });
  };

  return {
    ...state,
    setWorld,
    setRules,
    setTone,
    setConflicts,
    setDecisions,
    setTypesOfThreads,
    handleArrayFieldChange,
    handleAddArrayItem,
    handleRemoveArrayItem,
    updateGuidelines,
  };
}
