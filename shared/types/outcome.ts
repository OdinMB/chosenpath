import { z } from "zod";

const challengeResolutionsSchema = z
  .object({
    favorable: z
      .string()
      .describe(
        "Resolution that is favorable to the player(s) and/or particularly interesting."
      ),
    unfavorable: z
      .string()
      .describe(
        "Resolution that is unfavorable for the player(s) and/or unsatisfactory."
      ),
    mixed: z
      .string()
      .describe("A resolution that is between favorable and unfavorable."),
  })
  .describe("Use this for outcomes that can succeed or fail.");
export type ChallengeResolution = z.infer<typeof challengeResolutionsSchema>;

const contestResolutionsSchema = z
  .object({
    sideAWins: z.string().describe("Resolution of side A winning."),
    sideBWins: z.string().describe("Resolution of side B winning."),
    mixed: z.string().describe("Resolution of a draw/compromise."),
  })
  .describe("Use this for outcomes that are contested between players.");
export type ContestResolution = z.infer<typeof contestResolutionsSchema>;

const explorationResolutionsSchema = z
  .object({
    resolution1: z.string(),
    resolution2: z.string(),
    resolution3: z.string(),
  })
  .describe(
    "Use this for outcomes that don't follow a success/failure and win/lose structure. Example: Does Alex choose loyalty to the family or their own ambitions?"
  );
export type ExplorationResolution = z.infer<
  typeof explorationResolutionsSchema
>;

export type ResolutionType =
  | ChallengeResolution
  | ContestResolution
  | ExplorationResolution;

export const outcomeSchema = z
  .object({
    id: z
      .string()
      .describe(
        "Use a short phrase with underscores, starting with either a player id or 'shared'. For example: 'shared_murderer_found' or 'player2_relationship_with_catya'."
      ),
    question: z.string().describe("Question that defines the outcome"),
    possibleResolutions: z
      .union([
        challengeResolutionsSchema,
        contestResolutionsSchema,
        explorationResolutionsSchema,
      ])
      .describe("Possible resolutions for this outcome"),
    resonance: z
      .string()
      .describe(
        "For individual outcomes: Why does this matter to the character? What needs, hopes, fears, or traumas are involved?\n" +
          "For shared outcomes: What makes this meaningful to the group? If competitive, what drives each player's stake in this outcome?"
      ),
    intendedNumberOfMilestones: z
      .number()
      .describe(
        "The number of milestones needed to reach a resolution. 1 for side-outcomes, 2 as a default, 3 for outcomes that are particularly important for the ending."
      ),
    milestones: z.array(z.string()).describe("Initially empty."),
  })
  .describe(
    "Defines a story ending element.\n" +
      "Examples:\n" +
      "Individual: 'Does Alex choose loyalty to the family or their own ambitions?'\n" +
      "Shared cooperative: 'Do the players successfully prevent the ritual?'\n" +
      "Shared competitive: 'Which player gains control of the artifact?'\n" +
      "Questions and options must be specific and depend on player choices."
  );

export type Outcome = z.infer<typeof outcomeSchema>;
