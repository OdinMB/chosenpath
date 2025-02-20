import { z } from "zod";

export const potentialMilestoneSchema = z.object({
  outcomeId: z
    .string()
    .describe(
      "Id of the outcome that this potential milestone would be added to. Can be an outcome associated with a player or a shared outcome."
    ),
  possibleMilestones: z
    .array(z.string())
    .describe(
      "Possible milestones that might be added to this outcome at the end of this thread (depending on player choices)"
    ),
});

export const threadSchema = z.object({
  notes: z
    .string()
    .describe("Notes on pacing and narrative guidelines for the thread."),
  outcomes: z
    .array(potentialMilestoneSchema)
    .describe(
      "List of outcomes that will get a new milestones at the end of this thread. Can be left empty if this is an 'agency' thread."
    ),
  playerIds: z
    .array(z.string())
    .describe("Ids of the players that are part of this thread."),
  duration: z
    .number()
    .describe(
      "Expected number of beats in this thread. Use 1 if you want to give the player(s) agency over the next thread (e.g. quick prioritization), or 2-4 if you want to create a set of threads to push outcomes closer to resolution."
    ),
  id: z
    .string()
    .describe(
      "Unique identifier for the thread. Use a short phrase with underscores, like 'search_for_timmy'."
    ),
  title: z.string().describe("Thread title"),
});

export const createSetOfThreadsSchema = z.object({
  plan: z
    .string()
    .describe(
      "Detailed plan for creating the next thread (or set of threads). Must include:\n" +
        "a) How could we make progress towards unresolved story outcomes? (with a detailed overview of the unresolved outcomes and the questions that could be answered in this thread)\n" +
        "b) What are the most important questions we should focus on?\n" +
        "c) Decision on which type of threads to create (e.g. 'agency' or 'push outcomes closer to resolution') with justification\n" +
        "d) The right duration for this thread (or set of threads)\n" +
        "e) A high-level structure for this thread (or set of threads) with players, outcomes, and questions"
    ),
  threads: z
    .array(threadSchema)
    .describe(
      "The next thread (or set of threads) the story will go through (in parallel). All players must be in exactly one thread, and each character can only be in one thread."
    ),
});

export type SetOfThreadsGenerationSchema = {
  plan: string;
  threads: Thread[];
};

export type Thread = z.infer<typeof threadSchema>;
