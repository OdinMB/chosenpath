import { Outcome } from "@core/types";

// Define PlayerOutcome type
interface PlayerOutcome {
  id: string;
  question: string;
  resonance: string;
  possibleResolutions:
    | { favorable: string; unfavorable: string; mixed: string }
    | { resolution1: string; resolution2: string; resolution3: string };
  intendedNumberOfMilestones: number;
  milestones: string[];
}

// Define resolution types
interface ChallengeResolution {
  favorable: string;
  unfavorable: string;
  mixed: string;
}

interface ExplorationResolution {
  resolution1: string;
  resolution2: string;
  resolution3: string;
}

type ResolutionType = ChallengeResolution | ExplorationResolution;
type OutcomeType = Outcome | PlayerOutcome;

interface UseOutcomeFormResult {
  isChallenge: (res: ResolutionType) => res is ChallengeResolution;
  isExploration: (res: ResolutionType) => res is ExplorationResolution;
  handleResolutionTypeChange: (
    type: string,
    data: OutcomeType,
    onChange: (updatedData: OutcomeType) => void
  ) => void;
  handleResolutionFieldChange: (
    data: OutcomeType,
    field: string,
    value: string,
    onChange: (updatedData: OutcomeType) => void
  ) => void;
}

export function useOutcomeForm(): UseOutcomeFormResult {
  // Helper functions to check resolution type
  const isChallenge = (res: ResolutionType): res is ChallengeResolution =>
    "favorable" in res;

  const isExploration = (res: ResolutionType): res is ExplorationResolution =>
    "resolution1" in res;

  const handleResolutionTypeChange = (
    type: string,
    data: OutcomeType,
    onChange: (updatedData: OutcomeType) => void
  ) => {
    const resolutions = data.possibleResolutions as ResolutionType;

    // Get existing values to preserve them
    let favorable = "";
    let unfavorable = "";
    let mixed = "";
    let resolution1 = "";
    let resolution2 = "";
    let resolution3 = "";

    if (isChallenge(resolutions)) {
      favorable = resolutions.favorable;
      unfavorable = resolutions.unfavorable;
      mixed = resolutions.mixed;
    } else if (isExploration(resolutions)) {
      resolution1 = resolutions.resolution1;
      resolution2 = resolutions.resolution2;
      resolution3 = resolutions.resolution3;
    }

    if (type === "challenge") {
      onChange({
        ...data,
        possibleResolutions: {
          favorable: favorable || resolution1 || "",
          unfavorable: unfavorable || resolution2 || "",
          mixed: mixed || resolution3 || "",
        },
      });
    } else {
      onChange({
        ...data,
        possibleResolutions: {
          resolution1: resolution1 || favorable || "",
          resolution2: resolution2 || unfavorable || "",
          resolution3: resolution3 || mixed || "",
        },
      });
    }
  };

  const handleResolutionFieldChange = (
    data: OutcomeType,
    field: string,
    value: string,
    onChange: (updatedData: OutcomeType) => void
  ) => {
    const resolutions = data.possibleResolutions as ResolutionType;

    const updated = {
      ...data,
      possibleResolutions: {
        ...resolutions,
        [field]: value,
      },
    };

    onChange(updated);
  };

  return {
    isChallenge,
    isExploration,
    handleResolutionTypeChange,
    handleResolutionFieldChange,
  };
}
