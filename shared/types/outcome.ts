import { z } from "zod";

export const outcomeSchema = z
  .object({
    id: z
      .string()
      .describe(
        "Use a short phrase with underscores, like 'murderer_found' or 'relationship_with_x'."
      ),
    question: z.string().describe("Question that defines the outcome"),
    possibleOutcomes: z
      .array(z.string())
      .describe("List of potential outcomes or resolutions"),
    intendedNumberOfMilestones: z
      .number()
      .describe(
        "The number of milestones that should bring this outcome to its resolution. Define a number that makes sense given the number of beats of the story and how much space this outcome should get."
      ),
    milestones: z.array(z.string()).describe("Initially empty."),
  })
  .describe(
    "Outcome that (co-)defines the ending of the story for this player. No intermediate outcomes, only elements of the ending.\n" +
      "For exmaple: Is the murderer found? Does the player stay loyal to X or follow Y instead?\n" +
      "Only include outcomes that depend on the player's choices. Bad: 'What is the truth about X ?' (doesn't depend on player choicer). Good: 'Does the player find out the truth about X?'\n" +
      "Questions and options must be specific. Bad: 'Personal and group relationships'. Good: 'What type of relationship to NPC X does the player character end up with?'"
  );

export const outcomesSchema = z
  .array(outcomeSchema)
  .describe(
    "Outcomes that will make up the ending of the story for this player. No intermediate outcomes, only elements of the ending."
  );
