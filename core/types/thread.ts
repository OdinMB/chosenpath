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

// Resolution types for challenges and exploration
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

// Combined resolution type for all types of threads
export type Resolution =
  | ResolutionChallenge
  | ResolutionContest
  | ResolutionExploration;

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
    "What the different step outcomes in a thread with a success/failure characteristic mean narratively (example for unfavorable: '[insert player name] stumbles and alerts the guards')"
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
    "What the different step outcomes in an exploratory thread mean narratively (example for outcome1: '[insert player name] chooses to talk to [npc]')"
  );

const threadStepSchema = z.object({
  title: z.string().describe("Title of this step"),
  question: z
    .string()
    .describe(
      "Type of decision that the player(s) make in this step of the thread. Format: 'Title: Question'. Bad: 'What do [insert player names] find in the cellar?' (not related to player choices). Good: 'Investigation: How do [insert player names] search for clues in the cellar?'"
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
  previousThreadTypesToBeAvoided: z
    .array(z.string())
    .describe(
      "Previous thread types that the players in this thread have been involved in. (These types of threads should be avoided for this thread to avoid repetition.)"
    ),
  relevantSuggestedThreadTypes: z
    .array(z.string())
    .describe(
      "Thread types that are suggested for this story in general and that might work well for this thread."
    ),
  typeOfThread: z
    .string()
    .describe(
      "Short description of the type of thread. Examples: Chase, Negotiation, Exploration, Fight. Should be different from the previous three threads. (If one of the three previous threads was a chase/negotiation/fight/whatever, this thread should not be another chase/negotiation/fight/whatever.)"
    ),
  typeOfMilestone: z
    .string()
    .describe(
      "What type of milestone sould this thread be adding to the outcome (finding/not finding a clue, convincing/not convincing the council, etc.)?"
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
      "Progression of steps that structure this thread. Must have exactly as many steps as the duration of the thread. (If the thread has a duration of 3 beats, this field must have 3 steps.) The milestone will be decided after the last player decision on the last beat. The other beats should work towards that climax. Make sure that each step infers an advantage or disadvantage on the next step, without making the next step impossible to reach or resolve. The types of decisions that player(s) make should be different for each step."
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
  firstBeatIndex: number;
  progression: ThreadStep[];
  resolution: Resolution | null;
  milestone: string | null;
};

export type ThreadAnalysis = Omit<
  z.infer<typeof threadAnalysisSchema>,
  "threads"
> & {
  firstBeatIndex: number;
  threads: Thread[];
};
