import { z } from "zod";

export const pronounSchema = z
  .enum(["he/him", "she/her", "they/them", "it/its"])
  .describe("Character's preferred pronouns");

export const NPCSchema = z
  .object({
    name: z.string().describe("NPC's name"),
    role: z.string().describe("NPC's role in the story"),
    pronouns: pronounSchema,
    traits: z.array(z.string()).describe("NPC's defining traits"),
  })
  .describe("Important NPC in the story.");

export const NPCsSchema = z
  .array(NPCSchema)
  .describe(
    "List of important NPCs in the story. Don't include the player character (main protagonist) in this list."
  );

export const PCSchema = z
  .object({
    name: z.string().describe("Player character's name"),
    pronouns: pronounSchema,
    fluff: z
      .string()
      .describe(
        "Fluff text about the player character that will be referenced in the story. Make sure that this works for any gender and pronouns."
      ),
  })
  .describe(
    "Player character. Note that the player will be able to change the name and pronouns before the story begins."
  );
