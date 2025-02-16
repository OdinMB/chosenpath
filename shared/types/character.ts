import { z } from "zod";

export const NPCSchema = z
  .object({
    name: z.string().describe("NPC's name"),
    role: z.string().describe("NPC's role in the story"),
    pronouns: z.string().describe("NPC's preferred pronouns"),
    traits: z
      .array(z.string())
      .describe("NPC's defining traits in the context of the story"),
    fluff: z
      .string()
      .describe(
        "Fluff text about the NPC that can be referenced in the story. 1 sentence. Appearance, quirks, etc."
      ),
  })
  .describe("Important NPC in the story.");

export const NPCsSchema = z
  .array(NPCSchema)
  .describe(
    "List of important NPCs in the story. Don't include the player characters (main protagonists) in this list."
  );

export const PCSchema = z
  .object({
    name: z.string().describe("Player character's name"),
    pronouns: z.string().describe("Player character's preferred pronouns"),
    fluff: z
      .string()
      .describe(
        "Fluff text about the player character that will be referenced in the story."
      ),
  })
  .describe("Basic player character info.");
