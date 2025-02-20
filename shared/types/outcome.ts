import { z } from "zod";

export const outcomeSchema = z
  .object({
    id: z
      .string()
      .describe(
        "Use a short phrase with underscores, like 'shared_murderer_found' or 'player2_relationship_with_catya'."
      ),
    question: z.string().describe("Question that defines the outcome"),
    possibleResolutions: z
      .array(z.string())
      .describe(
        "List 2-3 potential resolutions that could result from player choices."
      ),
    resonance: z
      .string()
      .describe(
        "For individual outcomes: Why does this matter to the character? What needs, hopes, fears, or traumas are involved?\n" +
          "For shared outcomes: What makes this meaningful to the group? If competitive, what drives each player's stake in this outcome?"
      ),
    intendedNumberOfMilestones: z
      .number()
      .describe(
        "The number of milestones needed to reach resolution. Consider the story length and this outcome's importance (whether individual or shared)."
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

export const outcomesSchema = z.array(outcomeSchema);
