import { DifficultyLevel } from "../types/index.js";
import { DEFAULT_SELECTED_DIFFICULTY_MODIFIER } from "../config.js";

export const DEFAULT_DIFFICULTY_LEVELS: DifficultyLevel[] = [
  {
    modifier: 10,
    title: "Relaxed",
  },
  {
    modifier: 0,
    title: "Light Challenge",
  },
  {
    modifier: -10,
    title: "Balanced",
  },
  {
    modifier: -20,
    title: "Considerable Challenge",
  },
  {
    modifier: -30,
    title: "Demanding Narrative",
  },
  {
    modifier: -40,
    title: "Grueling",
  },
];

export function getDifficultyDescription(modifier: number): string {
  if (modifier >= 10) {
    return "Things tend to go well for you.";
  }
  if (modifier >= 0) {
    return "Things tend to go well for you in the end.";
  }
  if (modifier >= -10) {
    return "A balanced experience.";
  }
  if (modifier >= -20) {
    return "You will experience significant challenges.";
  }
  if (modifier >= -30) {
    return "Constant struggle. You will play against the odds.";
  }
  return "The odds are stacked against you. Good luck!";
}

export function getDefaultDifficultyLevel(): DifficultyLevel {
  const defaultLevel = DEFAULT_DIFFICULTY_LEVELS.find(
    (level) => level.modifier === DEFAULT_SELECTED_DIFFICULTY_MODIFIER
  );
  // Fallback to the first level if the specific default modifier isn't found (should not happen with current setup)
  // or if DEFAULT_DIFFICULTY_LEVELS is somehow empty (even more unlikely).
  if (defaultLevel) {
    return defaultLevel;
  }
  //This fallback should ideally never be reached if constants are set up correctly.
  if (DEFAULT_DIFFICULTY_LEVELS.length > 0) {
    return DEFAULT_DIFFICULTY_LEVELS[0];
  }
  // Absolute fallback, though this indicates a deeper configuration issue.
  return {
    modifier: DEFAULT_SELECTED_DIFFICULTY_MODIFIER,
    title: "Standard Experience", // Default title if list is empty
  };
}
