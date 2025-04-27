import { TemplateIterationSections } from "../types/index.js";

// Maps section keys to the corresponding StoryTemplate property keys
export const templateIterationSections: Record<string, string[]> = {
  guidelines: ["guidelines"],
  storyElements: ["storyElements"],
  sharedOutcomes: ["sharedOutcomes"],
  stats: [
    "statGroups",
    "sharedStats",
    "playerStats",
    "initialSharedStatValues",
  ],
  // player1-n will be added programmatically
  players: ["characterSelectionIntroduction", "characterSelectionPlan"],
  media: ["imageInstructions"],
} as const;
