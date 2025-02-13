import { z } from "zod";
import { imageLibrarySchema } from "./image.js";
import { beatHistorySchema } from "./beat.js";
import { statsSchema } from "./stat.js";
import { NPCsSchema, PCSchema } from "./character.js";
import { outcomesSchema } from "./outcome.js";

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

export const storyStateSchema = z.object({
  guidelines: guidelinesSchema,
  stats: statsSchema,
  npcs: NPCsSchema,
  player: PCSchema,
  outcomes: outcomesSchema,
  establishedFacts: z.array(z.string()),
  beatHistory: beatHistorySchema,
  maxTurns: z.number(),
  generateImages: z.boolean(),
  images: imageLibrarySchema,
});

export const storySetupSchema = z
  .object({
    guidelines: guidelinesSchema,
    pc: PCSchema,
    npcs: NPCsSchema,
    outcomes: outcomesSchema,
    stats: statsSchema,
  })
  .describe("Initial setup for the story");

export type StoryState = z.infer<typeof storyStateSchema>;
export type StorySetup = z.infer<typeof storySetupSchema>;
