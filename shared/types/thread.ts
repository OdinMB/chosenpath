import { z } from "zod";
import { PLAYER_SLOTS } from "./player.js";

export const THREAD_TYPE = ["challenge", "contest", "exploration"] as const;
export type ThreadType = (typeof THREAD_TYPE)[number];

export const getThreadType = (thread: Thread): ThreadType => {
  if (thread.playersSideB.length > 0) {
    return "contest";
  } else if ("favorable" in thread.progression[0].possibleResolutions) {
    return "challenge";
  } else {
    return "exploration";
  }
};

export const RESOLUTION_CHALLENGE = [
  "favorable",
  "mixed",
  "unfavorable",
] as const;
export type ResolutionChallenge = (typeof RESOLUTION_CHALLENGE)[number];

export const RESOLUTION_CONTEST = ["sideAWins", "mixed", "sideBWins"] as const;
export type ResolutionContest = (typeof RESOLUTION_CONTEST)[number];

export const RESOLUTION_EXPLORATION = [
  "resolution1",
  "resolution2",
  "resolution3",
] as const;
export type ResolutionExploration = (typeof RESOLUTION_EXPLORATION)[number];

export const RESOLUTION = [
  ...RESOLUTION_CHALLENGE,
  ...RESOLUTION_CONTEST,
  ...RESOLUTION_EXPLORATION,
] as const;
export type Resolution = (typeof RESOLUTION)[number];

// For standard (non-contested) threads
const challengeMilestonesSchema = z
  .object({
    favorable: z.string().describe("Milestone to add on favorable outcome"),
    mixed: z.string().describe("Milestone to add on mixed outcome"),
    unfavorable: z.string().describe("Milestone to add on unfavorable outcome"),
  })
  .describe(
    "Possible milestones for threads with a success/failure characteristic."
  );

// For contested multiplayer threads
const contestMilestonesSchema = z
  .object({
    sideAWins: z.string().describe("Milestone to add if Side A wins"),
    mixed: z.string().describe("Milestone to add on a draw/compromise"),
    sideBWins: z.string().describe("Milestone to add if Side B wins"),
  })
  .describe(
    "Only in multiplayer games: Possible milestones for threads over outcomes that are contested between players."
  );

// For exploratory threads
const explorationMilestonesSchema = z
  .object({
    resolution1: z.string(),
    resolution2: z.string(),
    resolution3: z.string(),
  })
  .describe(
    "Possible milestones for threads around character and narrative exploration whose outcomes don't have a success/failure characteristic."
  );

// For standard (non-contested) threads
const challengeStepResolutionsSchema = z
  .object({
    favorable: z.string(),
    mixed: z.string(),
    unfavorable: z.string(),
  })
  .describe(
    "What the different step outcomes in a thread with a success/failure characteristic mean narratively (example for unfavorable: '[player name] stumbles and alerts the guards')"
  );

// For contested multiplayer threads
const contestStepResolutionsSchema = z
  .object({
    sideAWins: z.string(),
    mixed: z.string(),
    sideBWins: z.string(),
  })
  .describe(
    "What the different step outcomes in a thread over a contested outcome mean narratively (example for mixed: 'The council remains divided and uncertain')"
  );

// For exploratory threads
const explorationStepResolutionsSchema = z
  .object({
    resolution1: z.string(),
    resolution2: z.string(),
    resolution3: z.string(),
  })
  .describe(
    "What the different step outcomes in an exploratory thread mean narratively (example for outcome1: '[player name] chooses to talk to [npc]')"
  );

const threadStepSchema = z.object({
  title: z.string().describe("Title of this step"),
  question: z
    .string()
    .describe(
      "Question that will be answered by the players' choices and that determines the kinds of choices that are available to players. Example: 'How will [player names] close the deal?'"
    ),
  possibleResolutions: z
    .union([
      challengeStepResolutionsSchema,
      contestStepResolutionsSchema,
      explorationStepResolutionsSchema,
    ])
    .describe(
      "What happens narratively for the different outcomes of this step"
    ),
});

export const threadSchema = z.object({
  plan: z
    .string()
    .describe(
      "A plan guiding the creation of this thread. Include the following points:\n- More specifically, which outcome will this thread add a milestone to?\n- Given that outcome, what type of milestone could this thread be adding to the outcome (finding/not finding a clue, convincing/not convincing the council, etc.)?\n- Which progression of beats (as many beats as the thread's duration) will lead us to the resolution of this thread (where we add a milestone to the outcome)? Make sure that each step infers an advantage or disadvantage on the next step, without making the next step impossible to reach or resolve. The milestone will be decided after the last player decision on the last beat. Other beats should work towards that climax."
    ),
  outcomeId: z
    .string()
    .describe(
      "ID of the outcome (individual or shared) that this thread will add a milestone to."
    ),
  playersSideA: z
    .array(z.enum(PLAYER_SLOTS as [string, ...string[]]))
    .describe(
      "IDs of players who make up Side A. In a singleplayer or cooperative thread, add all players to this list. In a multiplayer thread over a contested outcome, only add players who are on Side A and put opposing players on Side B."
    ),
  playersSideB: z
    .array(z.enum(PLAYER_SLOTS as [string, ...string[]]))
    .describe(
      "Only relevant for multiplayer threads over contested outcomes. IDs of players who make up Side B. In a singleplayer or cooperative thread, leave this empty."
    ),
  possibleMilestones: z
    .union([
      challengeMilestonesSchema,
      contestMilestonesSchema,
      explorationMilestonesSchema,
    ])
    .describe(
      "One of these milestones will be added to the outcome at the end of the thread. Make sure that the milestones only constitute one step toward the outcome's resolution."
    ),
  progression: z
    .array(threadStepSchema)
    .describe(
      "Progression of steps that structure this thread. Must have exactly as many steps as the duration of the thread. (If the thread has a duration of 3 beats, this field must have 3 steps.)"
    ),
  title: z
    .string()
    .describe(
      "Thread title. Will be used as the title for the beats in this thread"
    ),
  id: z
    .string()
    .describe(
      "Unique identifier for the thread. Should be a short phrase with underscores based on the thread title"
    ),
});

export const threadAnalysisSchema = z.object({
  coordinationPatternSummary: z
    .string()
    .describe(
      "Write a summary of how you want to set up the threads, and which player should join which thread. Consider the current switch configuration and the last set of player choices. (That's where they chose what they want to do in their next (= this) thread.) Be specific about what the threads will be about."
    ),
  duration: z
    .number()
    .describe(
      "Number of beats for this thread (or set of threads). Must be between 2-4. Will be the same for all threads."
    ),
  threads: z
    .array(threadSchema)
    .describe(
      "The next thread (or set of threads) the story will go through (in parallel). All players must be in exactly one thread, and each character can only be in one thread."
    ),
});

export type ThreadStep = z.infer<typeof threadStepSchema> & {
  resolution: Resolution | null;
};

export type Thread = Omit<z.infer<typeof threadSchema>, "progression"> & {
  duration: number;
  progression: ThreadStep[];
  resolution: Resolution | null;
  milestone: string | null;
};

export type ThreadAnalysis = Omit<
  z.infer<typeof threadAnalysisSchema>,
  "threads"
> & {
  threads: Thread[];
};
