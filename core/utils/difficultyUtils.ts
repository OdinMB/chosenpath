import { DifficultyLevel } from "../types/index.js";
import { DEFAULT_SELECTED_DIFFICULTY_MODIFIER } from "../config.js";

export const DEFAULT_DIFFICULTY_LEVELS: DifficultyLevel[] = [
  {
    modifier: 20,
    title: "Friendly",
  },
  {
    modifier: 10,
    title: "Relaxed",
  },
  {
    modifier: -0,
    title: "Balanced",
  },
  {
    modifier: -10,
    title: "Challenging",
  },
  {
    modifier: -20,
    title: "Struggle",
  },
  {
    modifier: -30,
    title: "Grueling",
  },
];

export function getDifficultyDescription(modifier: number): string {
  if (modifier >= 20) {
    return "Things tend to go well.";
  }
  if (modifier >= 10) {
    return "Things tend to go well in the end.";
  }
  if (modifier >= 0) {
    return "Ups and downs. A balanced experience.";
  }
  if (modifier >= -10) {
    return "Things can go wrong.";
  }
  if (modifier >= -20) {
    return "A constant struggle. You will play against the odds.";
  }
  return "Are you sure you want to do this?";
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
