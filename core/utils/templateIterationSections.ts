export const templateIterationSections = {
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
} as const;
