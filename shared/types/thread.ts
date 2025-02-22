import { z } from "zod";
import { PLAYER_SLOTS } from "./players.js";

export const threadOutcomeSchema = z.object({
  outcomeId: z
    .string()
    .describe(
      "ID of the outcome that this potential milestone would be added to. Can be an outcome associated with a player or a shared outcome."
    ),
  question: z
    .string()
    .describe(
      "Question that the thread poses to the player. This question is the focus of the thread."
    ),
  possibleMilestones: z
    .array(z.string())
    .describe(
      "Possible milestones that might be added to this outcome at the end of this thread (depending on player choices)"
    ),
});

export const threadSchema = z.object({
  outcomes: z
    .array(threadOutcomeSchema)
    .describe(
      "List of outcomes that will get a new milestones at the end of this thread."
    ),
  players: z
    .array(z.enum(PLAYER_SLOTS as [string, ...string[]]))
    .describe("IDs of players who are involved in this thread"),
  title: z
    .string()
    .describe(
      "Thread title. Will be used as the title for the beats in this thread. Think book chapter or TV series episode."
    ),
  id: z
    .string()
    .describe(
      "Unique identifier for the thread. Use a short phrase with underscores, like 'search_for_timmy'."
    ),
  beatProgression: z
    .string()
    .describe(
      "A simple progression of beats that creates tension over the course of the thread."
    ),
  multiplayerNotes: z
    .string()
    .describe(
      "Notes on how to coordinate several players in the same thread (if there are indeed several players)"
    ),
  relationshipToOtherThreads: z
    .string()
    .describe(
      "How this thread relates to other threads (especially if what happens in this thread can be influenced by what happens in other threads or vice versa). If this is a single-player game, just leave this blank."
    ),
});

export const threadAnalysisSchema = z.object({
  coordinationPatternSummary: z
    .string()
    .describe(
      "Write a summary of how you want to set up the threads based on the switch configuration and player choices. Especially which players should join the same thread. For single-player games, just leave this blank."
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

export type Thread = z.infer<typeof threadSchema>;
export type ThreadAnalysis = z.infer<typeof threadAnalysisSchema>;
