import { z } from "zod";
import { beatHistorySchema } from "./beat";
import { outcomesSchema } from "./outcome";
import { statsSchema } from "./stat";
import { imageLibrarySchema } from "./image";

export const pronounSchema = z
  .enum(["he/him", "she/her", "they/them"])
  .describe("Character's preferred pronouns");

export const guidelinesSchema = z
  .object({
    settingElements: z
      .array(z.string())
      .describe("Required characters, locations, and story elements"),
    rules: z
      .array(z.string())
      .describe("Fundamental rules governing the story world"),
    tone: z
      .array(z.string())
      .describe("Emotional and narrative tone guidelines"),
    conflicts: z
      .array(z.string())
      .describe(
        "Major conflicts driving the narrative. E.g. needs of superhero vs personal identity, confrontation with the nemesis"
      ),
    decisions: z
      .array(z.string())
      .describe(
        "Types of decisions that should occur in the game. E.g. prioritizing investigation leads given limited amount of time, following common sense morals vs. speeding up the investigation"
      ),
  })
  .describe("Story guidelines and parameters");

export const NPCSchema = z
  .object({
    name: z.string().describe("NPC's name"),
    role: z.string().describe("NPC's role in the story"),
    pronouns: pronounSchema,
    traits: z.array(z.string()).describe("NPC's defining traits"),
  })
  .describe("Important NPCs in the story.");

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

export const storyStateSchema = z.object({
  guidelines: guidelinesSchema,
  stats: statsSchema,
  npcs: NPCsSchema,
  player: PCSchema,
  outcomes: outcomesSchema,
  establishedFacts: z.array(z.string()),
  beatHistory: beatHistorySchema,
  currentTurn: z.number(),
  maxTurns: z.number(),
  generateImages: z.boolean(),
  images: imageLibrarySchema,
});

export type StoryState = z.infer<typeof storyStateSchema>;

export const storySetupSchema = z
  .object({
    guidelines: guidelinesSchema,
    pc: PCSchema,
    npcs: NPCsSchema,
    outcomes: outcomesSchema,
    stats: statsSchema,
  })
  .describe("Initial setup for the story");

export type StorySetup = z.infer<typeof storySetupSchema>;
