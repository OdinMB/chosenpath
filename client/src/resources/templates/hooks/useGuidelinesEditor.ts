import { useState, useEffect } from "react";
import { Guidelines } from "core/types";

interface UseGuidelinesEditorProps {
  guidelines: Guidelines;
  onChange?: (updates: { guidelines: Guidelines }) => void;
  readOnly?: boolean;
}

export function useGuidelinesEditor({
  guidelines,
  onChange,
  readOnly = false,
}: UseGuidelinesEditorProps) {
  // Single state object to manage all guidelines
  const [state, setState] = useState<Guidelines>({
    world: guidelines?.world || "",
    rules: guidelines?.rules || [],
    tone: guidelines?.tone || [],
    conflicts: guidelines?.conflicts || [],
    decisions: guidelines?.decisions || [],
    typesOfThreads: guidelines?.typesOfThreads || [],
    switchAndThreadInstructions: guidelines?.switchAndThreadInstructions || [],
  });

  // Update state when guidelines change
  useEffect(() => {
    setState({
      world: guidelines?.world || "",
      rules: guidelines?.rules || [],
      tone: guidelines?.tone || [],
      conflicts: guidelines?.conflicts || [],
      decisions: guidelines?.decisions || [],
      typesOfThreads: guidelines?.typesOfThreads || [],
      switchAndThreadInstructions:
        guidelines?.switchAndThreadInstructions || [],
    });
  }, [
    guidelines?.world,
    guidelines?.rules,
    guidelines?.tone,
    guidelines?.conflicts,
    guidelines?.decisions,
    guidelines?.typesOfThreads,
    guidelines?.switchAndThreadInstructions,
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
  const setSwitchAndThreadInstructions = (value: string[]) =>
    updateField("switchAndThreadInstructions", value);

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
    } else if (setter === setSwitchAndThreadInstructions) {
      const updatedArray = [...state.switchAndThreadInstructions];
      updatedArray[index] = value;
      setSwitchAndThreadInstructions(updatedArray);
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
    } else if (setter === setSwitchAndThreadInstructions) {
      setSwitchAndThreadInstructions([
        ...state.switchAndThreadInstructions,
        "",
      ]);
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
    } else if (setter === setSwitchAndThreadInstructions) {
      setSwitchAndThreadInstructions(
        state.switchAndThreadInstructions.filter((_, i) => i !== index)
      );
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
    setSwitchAndThreadInstructions,
    handleArrayFieldChange,
    handleAddArrayItem,
    handleRemoveArrayItem,
    updateGuidelines,
  };
}
